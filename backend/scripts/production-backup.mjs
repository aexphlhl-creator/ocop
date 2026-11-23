/**
 * OCOP Production Automated Database Backup & Pruning Engine
 * Supports local storage and independent off-site S3/MinIO cold storage.
 * Enforces SHA-256 checksum verification, pg_restore integrity check,
 * automated retention pruning, and webhook failure alerting.
 */

import { execFileSync } from 'child_process';
import { createHash, createHmac } from 'crypto';
import { mkdir, readdir, stat, unlink, readFile, writeFile } from 'fs/promises';
import { existsSync, createReadStream } from 'fs';
import { join } from 'path';
import { Client as MinioClient } from 'minio';
import 'dotenv/config';

export function computeSha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function signManifest(content, hmacSecret) {
  if (!hmacSecret || typeof hmacSecret !== 'string') return '';
  return createHmac('sha256', hmacSecret).update(content.trim()).digest('hex');
}

export function maskWebhookUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return '';
  try {
    const parsed = new URL(urlStr);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    let maskedPath = '';
    if (pathParts.length > 0) {
      maskedPath = '/' + pathParts[0] + '/***';
    } else {
      maskedPath = '/***';
    }
    return `${parsed.protocol}//${parsed.host}${maskedPath}`;
  } catch {
    return '***masked-url***';
  }
}

export async function sendAlert(webhookUrl, message, errorDetails) {
  if (!webhookUrl || !webhookUrl.trim()) return { skipped: true };
  const masked = maskWebhookUrl(webhookUrl);
  console.log(`[BACKUP-ALERT] Dispatching critical alert to webhook: ${masked}...`);
  try {
    const payload = {
      timestamp: new Date().toISOString(),
      service: 'ocop-postgres-backup',
      severity: 'CRITICAL',
      message,
      error: errorDetails || null,
    };
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errMsg = `Webhook target returned non-2xx status code: ${res.status} ${res.statusText}`;
      console.error(`[BACKUP-ALERT ERROR] ${errMsg}`);
      return { success: false, status: res.status, error: errMsg };
    }
    console.log(`[BACKUP-ALERT] Webhook dispatched successfully. HTTP status: ${res.status}`);
    return { success: true, status: res.status };
  } catch (alertErr) {
    console.error(`[BACKUP-ALERT ERROR] Failed to send webhook alert: ${alertErr.message}`);
    return { success: false, error: alertErr.message };
  }
}

export async function runProductionBackup(options = {}) {
  const isDirect = options.isDirect !== false;
  const startTime = Date.now();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const tier = (options.tier || process.env.BACKUP_TIER || 'daily').toLowerCase();
  const validTiers = ['hourly', 'daily', 'weekly', 'monthly', 'drill'];
  if (!validTiers.includes(tier)) {
    throw new Error(`[BACKUP CONFIG ERROR] Invalid BACKUP_TIER '${tier}'. Must be one of: ${validTiers.join(', ')}`);
  }

  // Tier-isolated filename and directory path
  const localDir = options.localDir || process.env.BACKUP_LOCAL_DIR || join(process.cwd(), 'backups', tier);
  const s3Prefix = options.s3Prefix !== undefined ? options.s3Prefix : (process.env.BACKUP_S3_PREFIX !== undefined ? process.env.BACKUP_S3_PREFIX : (tier === 'drill' ? '' : `${tier}/`));
  const filename = `ocop_backup_${tier}_${timestamp}.dump`;
  const s3DumpKey = `${s3Prefix}${filename}`;
  const s3ManifestKey = `${s3Prefix}${filename}.sha256`;
  const s3SigKey = `${s3Prefix}${filename}.sha256.sig`;
  let webhookUrl = options.webhookUrl || process.env.BACKUP_ALERT_WEBHOOK_URL;

  try {
    const dbUrl = options.dbUrl || process.env.BACKUP_DATABASE_URL || process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('[BACKUP ERROR] Missing database connection URL (BACKUP_DATABASE_URL or DATABASE_URL).');
    }

    const storageType = (options.storageType || process.env.BACKUP_STORAGE_TYPE || 'local').toLowerCase();
    const localFilePath = join(localDir, filename);

    // Retention duration calculation by tier
    let maxAgeMs;
    if (options.maxAgeMs !== undefined) {
      maxAgeMs = Number(options.maxAgeMs);
    } else if (tier === 'hourly') {
      const retentionHours = Number(options.retentionHours !== undefined ? options.retentionHours : (process.env.BACKUP_RETENTION_HOURS || 24));
      maxAgeMs = retentionHours * 60 * 60 * 1000;
    } else if (tier === 'weekly') {
      const retentionWeeks = Number(options.retentionWeeks !== undefined ? options.retentionWeeks : (process.env.BACKUP_RETENTION_WEEKS || 4));
      maxAgeMs = retentionWeeks * 7 * 24 * 60 * 60 * 1000;
    } else if (tier === 'monthly') {
      const retentionMonths = Number(options.retentionMonths !== undefined ? options.retentionMonths : (process.env.BACKUP_RETENTION_MONTHS || 12));
      maxAgeMs = retentionMonths * 30 * 24 * 60 * 60 * 1000;
    } else {
      // daily or drill
      const retentionDays = Number(options.retentionDays !== undefined ? options.retentionDays : (process.env.BACKUP_RETENTION_DAYS || 7));
      maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
    }

    const isProduction = process.env.NODE_ENV === 'production' || process.env.IS_PRODUCTION === 'true';
    const hmacSecret = options.hmacSecret || process.env.BACKUP_HMAC_SECRET;
    let s3Config = null;

    // FAIL FAST: Validate HMAC key in production
    if (isProduction) {
      if (!hmacSecret || typeof hmacSecret !== 'string' || hmacSecret.trim().length < 16) {
        throw new Error(
          '[BACKUP HMAC ERROR] BACKUP_HMAC_SECRET is strictly required in production (minimum 16 characters). Backup execution refused to prevent unsigned manifest generation.',
        );
      }
    }

    // FAIL FAST: Validate S3 configuration upfront before executing pg_dump
    if (storageType === 's3' || storageType === 'dual') {
      const s3Bucket = options.s3Bucket || process.env.BACKUP_S3_BUCKET;
      if (!s3Bucket) {
        throw new Error('[BACKUP ERROR] BACKUP_S3_BUCKET is required when BACKUP_STORAGE_TYPE is s3 or dual');
      }

      const s3Endpoint = options.s3Endpoint || process.env.BACKUP_S3_ENDPOINT;
      const s3AccessKey = options.s3AccessKey || process.env.BACKUP_S3_ACCESS_KEY;
      const s3SecretKey = options.s3SecretKey || process.env.BACKUP_S3_SECRET_KEY;
      const s3UseSSLRaw = options.s3UseSSL !== undefined ? options.s3UseSSL : process.env.BACKUP_S3_USE_SSL;
      const s3UseSSL = s3UseSSLRaw === true || s3UseSSLRaw === 'true';

      if (isProduction) {
        // In production: FAIL FAST on missing endpoint, localhost/loopback, missing credentials, minioadmin, or disabled TLS
        if (!s3Endpoint) {
          throw new Error('[BACKUP S3 CONFIG ERROR] BACKUP_S3_ENDPOINT is required in production environment.');
        }
        if (s3Endpoint === 'localhost' || s3Endpoint === '127.0.0.1' || s3Endpoint.startsWith('127.')) {
          throw new Error(`[BACKUP S3 CONFIG ERROR] Insecure endpoint '${s3Endpoint}' is strictly forbidden in production.`);
        }
        if (!s3AccessKey || !s3SecretKey) {
          throw new Error('[BACKUP S3 CONFIG ERROR] BACKUP_S3_ACCESS_KEY and BACKUP_S3_SECRET_KEY are required in production.');
        }
        if (s3AccessKey === 'minioadmin' || s3SecretKey === 'minioadmin') {
          throw new Error('[BACKUP S3 CONFIG ERROR] Default insecure credential \'minioadmin\' is strictly forbidden in production.');
        }
        if (!s3UseSSL) {
          throw new Error('[BACKUP S3 CONFIG ERROR] Production S3 cold storage requires TLS (BACKUP_S3_USE_SSL=true). Plaintext transmission is forbidden.');
        }
      } else {
        if (!s3Endpoint) {
          throw new Error('[BACKUP S3 CONFIG ERROR] BACKUP_S3_ENDPOINT must be configured for S3 storage.');
        }
        if (!s3AccessKey || !s3SecretKey) {
          throw new Error('[BACKUP S3 CONFIG ERROR] S3 credentials (access key / secret key) must be configured.');
        }
      }

      const finalPort = options.s3Port !== undefined ? Number(options.s3Port) : (process.env.BACKUP_S3_PORT ? Number(process.env.BACKUP_S3_PORT) : (s3UseSSL ? 443 : 9000));
      s3Config = {
        bucket: s3Bucket,
        endpoint: s3Endpoint,
        port: finalPort,
        useSSL: s3UseSSL,
        accessKey: s3AccessKey,
        secretKey: s3SecretKey,
      };
    }

    console.log('\n[PRODUCTION-BACKUP] ========================================');
    console.log(`[PRODUCTION-BACKUP] Starting automated backup at ${new Date().toISOString()}`);
    console.log(`[PRODUCTION-BACKUP] Backup Tier: ${tier}`);
    console.log(`[PRODUCTION-BACKUP] Destination Mode: ${storageType}`);
    console.log(`[PRODUCTION-BACKUP] Local Directory: ${localDir}`);
    console.log(`[PRODUCTION-BACKUP] Retention Window: ${(maxAgeMs / (3600 * 1000)).toFixed(1)} hour(s)`);
    if (s3Config) {
      console.log(`[PRODUCTION-BACKUP] S3 Destination Key: ${s3Config.bucket}/${s3DumpKey}`);
    }
    console.log('[PRODUCTION-BACKUP] ========================================\n');

    let backupSuccess = false;

    // 1. Ensure local storage directory exists
    await mkdir(localDir, { recursive: true });

    // 2. Execute pg_dump using custom binary format (-Fc)
    console.log(`[BACKUP STEP 1] Executing pg_dump to ${localFilePath}...`);
    let dumpGenerated = false;

    // Try host pg_dump first
    try {
      const pgDumpCmd = process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump';
      execFileSync(pgDumpCmd, ['--version'], { stdio: 'ignore' });
      execFileSync(
        pgDumpCmd,
        [
          '--dbname', dbUrl,
          '--format=c',
          '--blobs',
          '--no-owner',
          '--no-privileges',
          '--file', localFilePath,
        ],
        { stdio: 'inherit' },
      );
      dumpGenerated = true;
    } catch (hostErr) {
      if (hostErr.code === 'ENOENT') {
        console.log('[BACKUP] pg_dump not installed on host PATH. Executing via docker container ocop-postgres...');
        const urlObj = new URL(dbUrl);
        const dbName = urlObj.pathname.replace(/^\//, '') || 'postgres';
        const user = urlObj.username || 'postgres';
        const containerDumpPath = `/tmp/backup_${Date.now()}.dump`;

        execFileSync('docker', [
          'exec', 'ocop-postgres',
          'pg_dump',
          '-U', user,
          '-d', dbName,
          '-F', 'c',
          '-b',
          '-O',
          '-x',
          '-f', containerDumpPath,
        ]);
        execFileSync('docker', ['cp', `ocop-postgres:${containerDumpPath}`, localFilePath]);
        execFileSync('docker', ['exec', 'ocop-postgres', 'rm', '-f', containerDumpPath]);
        dumpGenerated = true;
      } else {
        throw hostErr;
      }
    }

    // 3. Verify dump integrity via pg_restore --list
    console.log('[BACKUP STEP 2] Verifying archive integrity via pg_restore --list...');
    let tocList = '';
    try {
      const pgRestoreCmd = process.platform === 'win32' ? 'pg_restore.exe' : 'pg_restore';
      execFileSync(pgRestoreCmd, ['--version'], { stdio: 'ignore' });
      tocList = execFileSync(pgRestoreCmd, ['--list', localFilePath], {
        encoding: 'utf8',
      });
    } catch (restoreHostErr) {
      if (restoreHostErr.code === 'ENOENT') {
        const containerTestPath = `/tmp/verify_${Date.now()}.dump`;
        execFileSync('docker', ['cp', localFilePath, `ocop-postgres:${containerTestPath}`]);
        tocList = execFileSync('docker', ['exec', 'ocop-postgres', 'pg_restore', '--list', containerTestPath], {
          encoding: 'utf8',
        });
        execFileSync('docker', ['exec', 'ocop-postgres', 'rm', '-f', containerTestPath]);
      } else {
        throw restoreHostErr;
      }
    }

    if (!tocList || tocList.trim().length === 0) {
      throw new Error('Integrity check failed: pg_restore --list returned empty TOC table of contents');
    }

    // 4. Compute cryptographic SHA-256 checksum and measure size
    const fileStats = await stat(localFilePath);
    const dumpBuffer = await readFile(localFilePath);
    const checksum = computeSha256(dumpBuffer);
    console.log(`[BACKUP STEP 3] Dump archive verified. Size: ${fileStats.size} bytes | SHA-256: ${checksum}`);

    // Create trusted .sha256 manifest file sidecar
    const manifestFilePath = `${localFilePath}.sha256`;
    const manifestFilename = `${filename}.sha256`;
    const manifestContent = `${checksum}  ${filename}\n`;
    await writeFile(manifestFilePath, manifestContent, 'utf8');
    console.log(`[BACKUP STEP 3] Trusted manifest written: ${manifestFilePath}`);

    // Generate cryptographic authenticity signature if HMAC secret is configured
    let signatureFilename = '';
    let signatureFilePath = '';
    if (hmacSecret) {
      const sig = signManifest(manifestContent, hmacSecret);
      signatureFilename = `${filename}.sha256.sig`;
      signatureFilePath = `${localFilePath}.sha256.sig`;
      await writeFile(signatureFilePath, sig + '\n', 'utf8');
      console.log(`[BACKUP STEP 3] Manifest cryptographic signature written: ${signatureFilePath}`);
    } else {
      console.warn('[BACKUP STEP 3] WARNING: BACKUP_HMAC_SECRET omitted. Manifest cryptographic signature skipped (non-production only).');
    }

    // 5. If S3 off-site storage is configured, upload to cold storage bucket
    if ((storageType === 's3' || storageType === 'dual') && s3Config) {
      console.log(`[BACKUP STEP 4] Uploading dump archive to independent off-site S3 bucket: ${s3Config.bucket} (${s3Config.endpoint}:${s3Config.port}, TLS: ${s3Config.useSSL})...`);
      const s3Client = new MinioClient({
        endPoint: s3Config.endpoint,
        port: s3Config.port,
        useSSL: s3Config.useSSL,
        accessKey: s3Config.accessKey,
        secretKey: s3Config.secretKey,
      });

      if (!(await s3Client.bucketExists(s3Config.bucket))) {
        console.log(`[BACKUP STEP 4] Off-site bucket ${s3Config.bucket} does not exist. Creating...`);
        await s3Client.makeBucket(s3Config.bucket, options.s3Region || 'us-east-1');
      }

      await s3Client.fPutObject(s3Config.bucket, s3DumpKey, localFilePath, {
        'x-amz-meta-sha256': checksum,
        'x-amz-meta-timestamp': timestamp,
        'x-amz-meta-tier': tier,
      });

      await s3Client.fPutObject(s3Config.bucket, s3ManifestKey, manifestFilePath, {
        'Content-Type': 'text/plain',
      });

      if (signatureFilename && existsSync(signatureFilePath)) {
        await s3Client.fPutObject(s3Config.bucket, s3SigKey, signatureFilePath, {
          'Content-Type': 'text/plain',
        });
        console.log(`[BACKUP STEP 4] Off-site S3 upload complete: ${s3Config.bucket}/${s3DumpKey}, ${s3Config.bucket}/${s3ManifestKey}, and ${s3Config.bucket}/${s3SigKey}`);
      } else {
        console.log(`[BACKUP STEP 4] Off-site S3 upload complete: ${s3Config.bucket}/${s3DumpKey} and ${s3Config.bucket}/${s3ManifestKey}`);
      }
    }

    // 6a. Local retention pruning: clean up local dumps and manifests older than maxAgeMs FOR THIS SPECIFIC TIER
    console.log(`[BACKUP STEP 5] Evaluating local retention policy for tier '${tier}' (max age: ${(maxAgeMs / (3600 * 1000)).toFixed(1)}h)...`);
    const files = await readdir(localDir).catch(() => []);
    const now = Date.now();
    let prunedCount = 0;

    for (const f of files) {
      if (
        f.startsWith(`ocop_backup_${tier}_`) &&
        (f.endsWith('.dump') || f.endsWith('.dump.sha256') || f.endsWith('.sha256') || f.endsWith('.sha256.sig'))
      ) {
        const fullPath = join(localDir, f);
        const s = await stat(fullPath);
        if (now - s.mtimeMs > maxAgeMs) {
          await unlink(fullPath);
          console.log(`  [LOCAL RETENTION PRUNED] Deleted expired ${tier} backup file: ${f}`);
          prunedCount++;
        }
      }
    }
    console.log(`[BACKUP STEP 5] Local retention pruning finished for tier '${tier}'. Pruned ${prunedCount} expired archive(s).`);

    // 6b. S3 cold storage retention pruning: clean up S3 objects older than maxAgeMs under this tier prefix
    let prunedS3Count = 0;
    const useLifecyclePruning = options.useLifecyclePruning !== undefined
      ? options.useLifecyclePruning
      : (process.env.BACKUP_S3_USE_LIFECYCLE_PRUNING === 'true');

    if ((storageType === 's3' || storageType === 'dual') && s3Config) {
      if (useLifecyclePruning) {
        console.log(`[BACKUP STEP 5] S3 retention pruning delegated to S3 Bucket Lifecycle / WORM Rules (BACKUP_S3_USE_LIFECYCLE_PRUNING=true). Manual deletion skipped for tier '${tier}'.`);
      } else {
        console.log(`[BACKUP STEP 5] Evaluating S3 cold storage retention for bucket '${s3Config.bucket}' under prefix '${s3Prefix}' (tier: ${tier})...`);
        const s3Client = new MinioClient({
          endPoint: s3Config.endpoint,
          port: s3Config.port,
          useSSL: s3Config.useSSL,
          accessKey: s3Config.accessKey,
          secretKey: s3Config.secretKey,
        });

        const stream = s3Client.listObjectsV2(s3Config.bucket, s3Prefix, true);
        const objectsToPrune = [];
        await new Promise((resolve, reject) => {
          stream.on('data', (obj) => {
            if (obj.name && (obj.name.startsWith(s3Prefix) || obj.name.includes(`_${tier}_`))) {
              const objAge = now - new Date(obj.lastModified).getTime();
              if (objAge > maxAgeMs) {
                objectsToPrune.push(obj.name);
              }
            }
          });
          stream.on('error', reject);
          stream.on('end', resolve);
        });

        for (const objKey of objectsToPrune) {
          try {
            await s3Client.removeObject(s3Config.bucket, objKey);
            console.log(`  [S3 RETENTION PRUNED] Deleted expired ${tier} S3 object: ${s3Config.bucket}/${objKey}`);
            prunedS3Count++;
          } catch (deleteErr) {
            const errMsg = deleteErr?.message || '';
            const errCode = deleteErr?.code || '';
            const isDefiniteObjectLock =
              errCode === 'ObjectUnderRetention' ||
              errMsg.toLowerCase().includes('object under retention') ||
              errMsg.toLowerCase().includes('worm') ||
              errMsg.toLowerCase().includes('governance retention') ||
              errMsg.toLowerCase().includes('compliance retention') ||
              (errCode === 'AccessDenied' && errMsg.toLowerCase().includes('retention'));

            if (isDefiniteObjectLock) {
              console.warn(
                `  [WORM/OBJECT-LOCK RETENTION] S3 object ${s3Config.bucket}/${objKey} is protected by Object Lock/WORM immutability policy. Deletion deferred to S3 Lifecycle rules: ${errMsg}`,
              );
            } else {
              const criticalPruneError = `[S3 RETENTION CRITICAL ERROR] Manual S3 object pruning failed for '${objKey}' due to IAM permission or network error (not Object Lock): ${errMsg}`;
              console.error(`  ${criticalPruneError}`);
              throw new Error(criticalPruneError);
            }
          }
        }
        console.log(`[BACKUP STEP 5] S3 retention pruning finished for tier '${tier}'. Pruned ${prunedS3Count} expired S3 object(s).`);
      }
    }

    // 7. Measure total backup & verification duration and protect against overlapping runs
    const durationMs = Date.now() - startTime;
    console.log(`[PERFORMANCE] Backup, verification & upload completed in ${durationMs} ms (${(durationMs / 1000).toFixed(2)}s).`);

    const alertThresholdMs = options.durationAlertThresholdMs ||
      (process.env.BACKUP_DURATION_ALERT_THRESHOLD_MS
        ? Number(process.env.BACKUP_DURATION_ALERT_THRESHOLD_MS)
        : (tier === 'hourly' ? 45 * 60 * 1000 : 4 * 3600 * 1000));

    if (durationMs > alertThresholdMs) {
      const warningMsg = `[BACKUP DURATION WARNING] Backup execution time of ${durationMs} ms exceeded warning threshold (${alertThresholdMs} ms) for tier '${tier}'. Risk of overlapping with next scheduled run!`;
      console.warn(warningMsg);
      await sendAlert(webhookUrl, warningMsg, `Duration: ${durationMs} ms`);
    }

    backupSuccess = true;
    console.log(`\n[PRODUCTION-BACKUP] SUCCESS: Backup ${filename} verified with SHA-256 and stored cleanly.\n`);
    return {
      success: true,
      tier,
      filename,
      filePath: localFilePath,
      s3DumpKey,
      s3ManifestKey,
      s3SigKey,
      size: fileStats.size,
      checksum,
      durationMs,
      prunedLocalCount: prunedCount,
      prunedS3Count,
    };
  } catch (err) {
    console.error('\n[PRODUCTION-BACKUP CRITICAL FAILURE]', err.message);
    await sendAlert(webhookUrl, `OCOP Database Backup FAILED for ${filename}`, err.message);
    if (isDirect) {
      process.exit(1);
    }
    throw err;
  }
}

export async function checkBackupFreshness(options = {}) {
  const tier = (options.tier || process.env.BACKUP_TIER || 'hourly').toLowerCase();
  const maxAllowedAgeMinutes = Number(
    options.maxAllowedAgeMinutes ||
    process.env.BACKUP_MAX_AGE_MINUTES ||
    (tier === 'hourly' ? 90 : 36 * 60),
  );
  const webhookUrl = options.webhookUrl || process.env.BACKUP_ALERT_WEBHOOK_URL;
  const localDir = options.localDir || process.env.BACKUP_LOCAL_DIR || join(process.cwd(), 'backups', tier);

  const files = await readdir(localDir).catch(() => []);
  const now = Date.now();
  let newestTime = 0;
  let newestFile = null;

  for (const f of files) {
    if (f.startsWith(`ocop_backup_${tier}_`) && f.endsWith('.dump')) {
      const s = await stat(join(localDir, f));
      if (s.mtimeMs > newestTime) {
        newestTime = s.mtimeMs;
        newestFile = f;
      }
    }
  }

  if (!newestFile) {
    const errorMsg = `[BACKUP FRESHNESS ALERT] No successful backup found for tier '${tier}' in '${localDir}'. Backup job may never have run!`;
    console.error(errorMsg);
    await sendAlert(webhookUrl, errorMsg, 'Missing backup files');
    return { fresh: false, ageMinutes: Infinity, newestFile: null };
  }

  const ageMinutes = Math.floor((now - newestTime) / (60 * 1000));
  if (ageMinutes > maxAllowedAgeMinutes) {
    const errorMsg = `[BACKUP STALENESS ALERT] Most recent ${tier} backup '${newestFile}' is ${ageMinutes} minutes old (threshold: ${maxAllowedAgeMinutes}m). CronJob may have failed or missed its schedule!`;
    console.error(errorMsg);
    await sendAlert(webhookUrl, errorMsg, `Age: ${ageMinutes}m, threshold: ${maxAllowedAgeMinutes}m`);
    return { fresh: false, ageMinutes, newestFile };
  }

  console.log(`[BACKUP FRESHNESS OK] Most recent ${tier} backup '${newestFile}' is ${ageMinutes}m old (within ${maxAllowedAgeMinutes}m threshold).`);
  return { fresh: true, ageMinutes, newestFile };
}

// Auto-run when executed directly from CLI
if (process.argv[1] && process.argv[1].endsWith('production-backup.mjs')) {
  runProductionBackup({ isDirect: true })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n[PRODUCTION-BACKUP CRITICAL FAILURE]', err.message);
      process.exit(1);
    });
}
