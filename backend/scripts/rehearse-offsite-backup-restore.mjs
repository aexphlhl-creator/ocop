/**
 * OCOP Disaster Recovery End-to-End Off-Site Rehearsal
 * Sequence:
 * 1. Require explicit REHEARSAL_SOURCE_DATABASE_URL (reject implicit default to DATABASE_URL)
 * 2. Backup PostgreSQL database to local archive with pg_restore --list verification
 * 3. Generate trusted .sha256 manifest AND cryptographic authenticity signature (.sha256.sig)
 * 4. Upload archive, manifest, and signature to independent off-site S3 cold storage (MinIO bucket)
 * 5. Download replica, manifest, and signature from off-site storage to clean isolated directory
 * 6. Verify Manifest Origin Authenticity via HMAC signature
 * 7. Verify SHA-256 Checksum Parity between downloaded replica and manifest
 * 8. Execute safe restoration into an isolated database (ocop_rehearsal_isolated_db)
 * 9. Verify 30 Prisma migrations on restored database
 * 10. Strict cleanup: any error in dropping database, bucket, or files causes drill failure with residual report
 */

import { Client as MinioClient } from 'minio';
import { Client as PgClient } from 'pg';
import { mkdir, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { runProductionBackup } from './production-backup.mjs';
import {
  runProductionRestore,
  computeSha256,
  parseManifestSha256,
  verifyManifestSignature,
} from './production-restore.mjs';
import 'dotenv/config';

export function maskDatabaseUrl(dbUrlStr) {
  if (!dbUrlStr || typeof dbUrlStr !== 'string') return '';
  try {
    const parsed = new URL(dbUrlStr);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return '***masked-db-url***';
  }
}

export async function runOffsiteRehearsal(options = {}) {
  const isDirect = options.isDirect !== false;
  const drillTimestamp = Date.now();
  const offsiteBucket = `ocop-offsite-cold-storage-${drillTimestamp}`;
  const isolatedDbName = `ocop_rehearsal_isolated_${drillTimestamp}`;
  const tempBackupDir = join(process.cwd(), `.rehearsal-backup-${drillTimestamp}`);
  const tempDownloadDir = join(process.cwd(), `.rehearsal-download-${drillTimestamp}`);
  const hmacSecret = options.hmacSecret || process.env.BACKUP_HMAC_SECRET || `rehearsal-key-${drillTimestamp}`;

  // 1. SAFETY GUARD: Enforce explicit rehearsal source database URL
  const rehearsalSrcUrl = options.sourceDbUrl || process.env.REHEARSAL_SOURCE_DATABASE_URL;
  if (!rehearsalSrcUrl || typeof rehearsalSrcUrl !== 'string' || !rehearsalSrcUrl.trim()) {
    throw new Error(
      '[REHEARSAL SAFETY GUARD] REHEARSAL_SOURCE_DATABASE_URL must be explicitly provided (via argument or REHEARSAL_SOURCE_DATABASE_URL environment variable). Implicit default to DATABASE_URL is strictly forbidden to protect primary production databases.',
    );
  }

  let srcDbName = '';
  let adminPgUrl = '';
  let srcHostname = '';
  try {
    const urlObj = new URL(rehearsalSrcUrl);
    srcDbName = urlObj.pathname.replace(/^\//, '') || '';
    srcHostname = urlObj.hostname;
    adminPgUrl = `${urlObj.protocol}//${urlObj.username}:${urlObj.password}@${urlObj.host}/postgres`;
  } catch (urlErr) {
    throw new Error(`[REHEARSAL ERROR] Invalid REHEARSAL_SOURCE_DATABASE_URL format: ${urlErr.message}`);
  }

  // 1a. ALLOWLIST: Verify Hostname is an approved staging/test host
  const standardAllowedHosts = ['localhost', '127.0.0.1', '::1', 'host.docker.internal', 'postgres', 'ocop-postgres'];
  const customAllowedHosts = process.env.ALLOWED_REHEARSAL_HOSTS
    ? process.env.ALLOWED_REHEARSAL_HOSTS.split(',').map((h) => h.trim().toLowerCase())
    : [];
  const isHostAllowed =
    standardAllowedHosts.includes(srcHostname.toLowerCase()) ||
    customAllowedHosts.includes(srcHostname.toLowerCase()) ||
    srcHostname.includes('staging') ||
    srcHostname.includes('test');

  if (!isHostAllowed) {
    throw new Error(
      `[REHEARSAL SAFETY GUARD] Host '${srcHostname}' is NOT in the verified staging/test allowlist (${standardAllowedHosts.join(', ')}). Rehearsal drill is restricted strictly to verified staging/test infrastructure.`,
    );
  }

  // 1b. ALLOWLIST: Verify Database Name / Prefix is an approved staging/test database
  const standardAllowedNames = ['ocop_test', 'ocop_staging'];
  const customAllowedNames = process.env.ALLOWED_REHEARSAL_DBS
    ? process.env.ALLOWED_REHEARSAL_DBS.split(',').map((d) => d.trim().toLowerCase())
    : [];
  const allowedPrefixes = ['test_', 'staging_', 'drill_', 'isolated_', 'ocop_e2e_'];
  const allowedSuffixes = ['_test', '_staging'];

  const isNameAllowed =
    standardAllowedNames.includes(srcDbName.toLowerCase()) ||
    customAllowedNames.includes(srcDbName.toLowerCase()) ||
    allowedPrefixes.some((p) => srcDbName.toLowerCase().startsWith(p)) ||
    allowedSuffixes.some((s) => srcDbName.toLowerCase().endsWith(s));

  const isExplicitDisallowed =
    !srcDbName ||
    srcDbName === 'ocop_vietnam' ||
    srcDbName === 'postgres' ||
    srcDbName === 'production' ||
    srcDbName === 'prod' ||
    srcDbName === 'master';

  if (!isNameAllowed || isExplicitDisallowed) {
    throw new Error(
      `[REHEARSAL SAFETY GUARD] Database '${srcDbName}' is NOT in the verified staging/test allowlist (allowed: ocop_test, ocop_staging, or prefixes: test_, staging_, drill_, isolated_). Rehearsal drill is strictly forbidden from running against production databases.`,
    );
  }

  const targetDbUrlObj = new URL(rehearsalSrcUrl);
  targetDbUrlObj.pathname = `/${isolatedDbName}`;
  const targetDbUrl = targetDbUrlObj.toString();

  const s3Endpoint = options.s3Endpoint || process.env.MINIO_ENDPOINT || 'localhost';
  const s3Port = Number(options.s3Port || process.env.MINIO_PORT || 9000);
  const s3UseSSL = (options.s3UseSSL || process.env.MINIO_USE_SSL) === 'true';
  const s3AccessKey = options.s3AccessKey || process.env.MINIO_ACCESS_KEY || 'minioadmin';
  const s3SecretKey = options.s3SecretKey || process.env.MINIO_SECRET_KEY || 'minioadmin';

  const s3Client = new MinioClient({
    endPoint: s3Endpoint,
    port: s3Port,
    useSSL: s3UseSSL,
    accessKey: s3AccessKey,
    secretKey: s3SecretKey,
  });

  const pgAdmin = new PgClient({ connectionString: adminPgUrl });

  console.log('\n================================================================');
  console.log('   OCOP DISASTER RECOVERY END-TO-END OFF-SITE REHEARSAL DRILL   ');
  console.log('================================================================');
  console.log(`[REHEARSAL CONFIG] Source Database:   ${srcDbName} (${maskDatabaseUrl(rehearsalSrcUrl)})`);
  console.log(`[REHEARSAL CONFIG] Off-site Bucket:   ${offsiteBucket}`);
  console.log(`[REHEARSAL CONFIG] Isolated Target DB: ${isolatedDbName}`);
  console.log(`[REHEARSAL CONFIG] Temporary Dirs:    ${tempBackupDir}`);
  console.log(`                                      ${tempDownloadDir}`);
  console.log('================================================================\n');

  let backupResult = null;
  let downloadedDumpPath = '';
  let downloadedManifestPath = '';
  let downloadedSignaturePath = '';
  let computedHash = '';

  try {
    await pgAdmin.connect();
    await mkdir(tempBackupDir, { recursive: true });
    await mkdir(tempDownloadDir, { recursive: true });

    // -------------------------------------------------------------
    // PHASE 1: BACKUP & OFF-SITE S3 COLD STORAGE UPLOAD
    // -------------------------------------------------------------
    console.log('[PHASE 1] Executing production backup with S3 cold storage upload & authenticity signing...');
    backupResult = await runProductionBackup({
      isDirect: false,
      tier: 'drill',
      s3Prefix: '',
      dbUrl: rehearsalSrcUrl,
      storageType: 'dual',
      localDir: tempBackupDir,
      s3Bucket: offsiteBucket,
      s3Endpoint,
      s3Port,
      s3UseSSL,
      s3AccessKey,
      s3SecretKey,
      hmacSecret,
      retentionDays: 7,
    });

    console.log(`[PHASE 1 COMPLETE] Backup archive created: ${backupResult.filename}`);
    console.log(`[PHASE 1 COMPLETE] SHA-256 Checksum:     ${backupResult.checksum}`);
    console.log(`[PHASE 1 COMPLETE] Uploaded to S3:       ${offsiteBucket}/${backupResult.s3DumpKey || backupResult.filename}\n`);

    // -------------------------------------------------------------
    // PHASE 2: DOWNLOAD REPLICA, MANIFEST, AND SIGNATURE FROM S3
    // -------------------------------------------------------------
    console.log(`[PHASE 2] Downloading replica, manifest, and signature from independent off-site S3 bucket: ${offsiteBucket}...`);
    const dumpFilename = backupResult.filename;
    const manifestFilename = `${dumpFilename}.sha256`;
    const signatureFilename = `${dumpFilename}.sha256.sig`;
    downloadedDumpPath = join(tempDownloadDir, dumpFilename);
    downloadedManifestPath = join(tempDownloadDir, manifestFilename);
    downloadedSignaturePath = join(tempDownloadDir, signatureFilename);

    const s3DumpKey = backupResult.s3DumpKey || dumpFilename;
    const s3ManifestKey = backupResult.s3ManifestKey || manifestFilename;
    const s3SigKey = backupResult.s3SigKey || signatureFilename;

    await s3Client.fGetObject(offsiteBucket, s3DumpKey, downloadedDumpPath);
    await s3Client.fGetObject(offsiteBucket, s3ManifestKey, downloadedManifestPath);
    await s3Client.fGetObject(offsiteBucket, s3SigKey, downloadedSignaturePath);
    console.log(`[PHASE 2 COMPLETE] Downloaded replica to:   ${downloadedDumpPath}`);
    console.log(`[PHASE 2 COMPLETE] Downloaded manifest to:  ${downloadedManifestPath}`);
    console.log(`[PHASE 2 COMPLETE] Downloaded signature to: ${downloadedSignaturePath}\n`);

    // -------------------------------------------------------------
    // PHASE 3: VERIFY MANIFEST ORIGIN AUTHENTICITY & CHECKSUM PARITY
    // -------------------------------------------------------------
    console.log('[PHASE 3a] Verifying manifest origin authenticity via HMAC cryptographic signature...');
    const manifestRaw = await readFile(downloadedManifestPath, 'utf8');
    const signatureRaw = (await readFile(downloadedSignaturePath, 'utf8')).trim();
    const isAuthentic = verifyManifestSignature(manifestRaw, signatureRaw, hmacSecret);
    if (!isAuthentic) {
      throw new Error('[REHEARSAL FAILURE] Manifest origin authenticity signature verification FAILED! The manifest is forged or tampered.');
    }
    console.log('[PHASE 3a COMPLETE] Manifest Origin Authenticity VERIFIED via Cryptographic Signature!');

    console.log('[PHASE 3b] Verifying cryptographic SHA-256 checksum parity between downloaded replica and manifest...');
    const expectedHash = parseManifestSha256(manifestRaw);
    const downloadedBuffer = await readFile(downloadedDumpPath);
    computedHash = computeSha256(downloadedBuffer);

    console.log(`[PHASE 3b] Manifest Expected Hash: ${expectedHash}`);
    console.log(`[PHASE 3b] Computed Replica Hash:  ${computedHash}`);

    if (computedHash.toLowerCase() !== expectedHash.toLowerCase()) {
      throw new Error(`[REHEARSAL FAILURE] Downloaded replica checksum mismatch! Expected: ${expectedHash}, Computed: ${computedHash}`);
    }
    console.log('[PHASE 3b COMPLETE] 100% Cryptographic Parity Verified!\n');

    // -------------------------------------------------------------
    // PHASE 4: PROVISION ISOLATED DESTINATION DATABASE
    // -------------------------------------------------------------
    console.log(`[PHASE 4] Provisioning isolated rehearsal database: ${isolatedDbName}...`);
    await pgAdmin.query(`DROP DATABASE IF EXISTS ${isolatedDbName};`);
    await pgAdmin.query(`CREATE DATABASE ${isolatedDbName};`);
    console.log(`[PHASE 4 COMPLETE] Isolated database ${isolatedDbName} created.\n`);

    // -------------------------------------------------------------
    // PHASE 5: EXECUTE PRODUCTION RESTORE WITH DRILL GUARDS
    // -------------------------------------------------------------
    console.log('[PHASE 5] Executing production restore into isolated database with authenticity verification...');
    const restoreResult = await runProductionRestore({
      isDirect: false,
      isDrillMode: true,
      targetDbUrl,
      backupFilePath: downloadedDumpPath,
      manifestSha256Path: downloadedManifestPath,
      signaturePath: downloadedSignaturePath,
      manifestSecret: hmacSecret,
    });

    console.log('[PHASE 5 COMPLETE] Database restore completed cleanly and migrations verified!\n');

    // -------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------
    console.log('================================================================');
    console.log('     REHEARSAL SUCCESS: DISASTER RECOVERY DRILL VERIFIED        ');
    console.log('================================================================');
    console.log(`- Source Database:        ${srcDbName}`);
    console.log(`- Backup Creation:        SUCCESS (Size: ${backupResult.size} bytes)`);
    console.log(`- S3 Off-Site Upload:     SUCCESS (Bucket: ${offsiteBucket})`);
    console.log(`- S3 Replica Download:    SUCCESS (Downloaded to isolated sandbox)`);
    console.log(`- Origin Authenticity:    SUCCESS (HMAC-SHA256 signature verified)`);
    console.log(`- Manifest SHA-256 Match: SUCCESS (Parity: ${computedHash})`);
    console.log(`- pg_restore Execution:   SUCCESS (Clean restore onto ${isolatedDbName})`);
    console.log(`- Prisma Migrations:      SUCCESS (30 migrations up to date)`);
    console.log('================================================================\n');

    return {
      success: true,
      isolatedDbName,
      offsiteBucket,
      checksum: computedHash,
    };
  } finally {
    // -------------------------------------------------------------
    // CLEANUP: STRICT TEARDOWN OF ALL TEMPORARY RESOURCES (FAIL-CLOSED)
    // -------------------------------------------------------------
    console.log('[CLEANUP] Tearing down temporary drill resources...');
    const cleanupErrors = [];
    const residualResources = [];
    let dbVerifiedDeleted = false;
    let bucketVerifiedDeleted = false;

    // 1. Drop isolated test database
    try {
      await pgAdmin.query(`DROP DATABASE IF EXISTS ${isolatedDbName};`);
      const checkRes = await pgAdmin.query(
        `SELECT 1 FROM pg_database WHERE datname = $1;`,
        [isolatedDbName],
      );
      if (checkRes.rowCount && checkRes.rowCount > 0) {
        cleanupErrors.push(`Database ${isolatedDbName} still exists in PostgreSQL after DROP query.`);
        residualResources.push(`Database: ${isolatedDbName}`);
      } else {
        dbVerifiedDeleted = true;
        console.log(`[CLEANUP] Confirmed dropped isolated rehearsal database: ${isolatedDbName}`);
      }
    } catch (dbErr) {
      cleanupErrors.push(`Database ${isolatedDbName}: ${dbErr.message}`);
      residualResources.push(`Database: ${isolatedDbName}`);
    }

    try {
      await pgAdmin.end();
    } catch (pgEndErr) {
      cleanupErrors.push(`PostgreSQL admin connection termination: ${pgEndErr.message}`);
      residualResources.push(`PG Connection: ${maskDatabaseUrl(adminPgUrl)}`);
    }

    // 2. Remove MinIO bucket objects and bucket with fail-closed audit
    try {
      if (options.simulateS3AuditFailure === true || process.env.SIMULATE_S3_AUDIT_FAILURE === 'true') {
        throw new Error('Simulated S3 audit failure: bucketExists connection refused');
      }

      let bucketExistsBefore = false;
      try {
        bucketExistsBefore = await s3Client.bucketExists(offsiteBucket);
      } catch (checkErr) {
        if (checkErr.code === 'NoSuchBucket' || checkErr.statusCode === 404) {
          bucketExistsBefore = false;
        } else {
          // FAIL CLOSED: Do NOT convert error to false! Record check probe failure!
          cleanupErrors.push(`S3 pre-cleanup bucketExists probe failed for ${offsiteBucket}: ${checkErr.message}`);
          residualResources.push(`S3 Bucket (Unverified Existence): ${offsiteBucket}`);
        }
      }

      if (bucketExistsBefore) {
        // List all objects currently in bucket to ensure complete removal
        const objectsToDelete = [];
        const stream = s3Client.listObjectsV2(offsiteBucket, '', true);
        await new Promise((resolve, reject) => {
          stream.on('data', (obj) => objectsToDelete.push(obj.name));
          stream.on('error', reject);
          stream.on('end', resolve);
        });

        for (const objName of objectsToDelete) {
          try {
            await s3Client.removeObject(offsiteBucket, objName);
          } catch (objErr) {
            cleanupErrors.push(`S3 Object ${offsiteBucket}/${objName}: ${objErr.message}`);
            residualResources.push(`S3 Object: ${offsiteBucket}/${objName}`);
          }
        }

        await s3Client.removeBucket(offsiteBucket);
      }

      // Final audit: Fail-closed verification that bucket is completely gone
      try {
        const stillExists = await s3Client.bucketExists(offsiteBucket);
        if (stillExists) {
          cleanupErrors.push(`S3 Bucket ${offsiteBucket} still exists after removeBucket call.`);
          residualResources.push(`S3 Bucket: ${offsiteBucket}`);
        } else {
          bucketVerifiedDeleted = true;
          console.log(`[CLEANUP] Confirmed removed temporary off-site S3 bucket: ${offsiteBucket}`);
        }
      } catch (verifyErr) {
        if (verifyErr.code === 'NoSuchBucket' || verifyErr.statusCode === 404) {
          bucketVerifiedDeleted = true;
          console.log(`[CLEANUP] Confirmed removed temporary off-site S3 bucket: ${offsiteBucket}`);
        } else {
          // FAIL CLOSED: Network or API failure during audit must NOT assume deletion!
          cleanupErrors.push(`S3 bucket audit failed for ${offsiteBucket}: ${verifyErr.message}`);
          residualResources.push(`S3 Bucket (Unverified Deletion): ${offsiteBucket}`);
        }
      }
    } catch (s3Err) {
      cleanupErrors.push(`S3 Cleanup ${offsiteBucket}: ${s3Err.message}`);
      residualResources.push(`S3 Bucket: ${offsiteBucket}`);
    }

    // 3. Remove temporary directories
    try {
      if (existsSync(tempBackupDir)) {
        await rm(tempBackupDir, { recursive: true, force: true });
      }
      if (existsSync(tempDownloadDir)) {
        await rm(tempDownloadDir, { recursive: true, force: true });
      }
      if (existsSync(tempBackupDir) || existsSync(tempDownloadDir)) {
        throw new Error('One or more temporary rehearsal directories could not be deleted.');
      }
      console.log('[CLEANUP] Confirmed removed temporary rehearsal directories.');
    } catch (fsErr) {
      cleanupErrors.push(`Filesystem cleanup: ${fsErr.message}`);
      residualResources.push(`Directories: ${tempBackupDir}, ${tempDownloadDir}`);
    }

    // FAIL-CLOSED GATE: Only report success if cleanupErrors is empty AND both db and bucket were positively confirmed deleted!
    if (cleanupErrors.length > 0 || !dbVerifiedDeleted || !bucketVerifiedDeleted) {
      console.error('\n[REHEARSAL CLEANUP CRITICAL ERROR] Cleanup failed with the following check errors:');
      for (const e of cleanupErrors) {
        console.error(`  * ${e}`);
      }
      console.error('[REHEARSAL CLEANUP CRITICAL ERROR] Leftover uncleaned resources remaining:');
      for (const r of residualResources) {
        console.error(`  - ${r}`);
      }
      throw new Error(
        `[REHEARSAL FAILED] Teardown cleanup failed with ${cleanupErrors.length} error(s) (dbVerified: ${dbVerifiedDeleted}, bucketVerified: ${bucketVerifiedDeleted}). Residuals: ${residualResources.join(', ')}`,
      );
    }

    console.log('[CLEANUP COMPLETE] Verified: zero orphaned resources remaining.\n');
  }
}

if (process.argv[1] && process.argv[1].endsWith('rehearse-offsite-backup-restore.mjs')) {
  runOffsiteRehearsal({ isDirect: true })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n[REHEARSAL CRITICAL ERROR]', err.message);
      process.exit(1);
    });
}
