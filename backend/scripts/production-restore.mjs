/**
 * OCOP Production Disaster Recovery Restoration Engine
 * Enforces strict safety guards:
 * 1. Explicit RESTORE_DATABASE_URL and RESTORE_FILE_PATH (no implicit fallback to DATABASE_URL)
 * 2. Mandatory cryptographic verification against trusted .sha256 manifest before pg_restore --clean
 * 3. Isolated rehearsal drill mode guard preventing accidental drill runs on production DB
 * 4. Dry-run mode for verification without state modification
 * 5. Deterministic schema verification via Prisma migrations
 */

import { execFileSync } from 'child_process';
import { createHash, createHmac } from 'crypto';
import { readFile } from 'fs/promises';
import { existsSync, createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function computeSha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Computes SHA-256 checksum of a file on disk via streaming in constant O(1) RAM,
 * preventing heap exhaustion or RangeError on large archives.
 */
export async function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

export function parseManifestSha256(manifestContent) {
  if (!manifestContent || typeof manifestContent !== 'string') return '';
  const firstLine = manifestContent.trim().split('\n')[0].trim();
  const match = firstLine.match(/^([a-f0-9]{64})\b/i);
  return match ? match[1].toLowerCase() : '';
}

export function verifyManifestSignature(content, signature, hmacSecret) {
  if (!hmacSecret || !signature) return false;
  const expected = createHmac('sha256', hmacSecret).update(content.trim()).digest('hex');
  return expected.toLowerCase() === signature.trim().toLowerCase();
}

export async function runProductionRestore(options = {}) {
  const isDirect = options.isDirect !== false;

  try {
    // 1. SAFETY GUARD: Enforce explicit target database URL (reject implicit fallback to DATABASE_URL)
    const targetDbUrl = options.targetDbUrl || process.env.RESTORE_DATABASE_URL;
    if (!targetDbUrl || typeof targetDbUrl !== 'string' || !targetDbUrl.trim()) {
      throw new Error(
        '[RESTORE SAFETY GUARD] RESTORE_DATABASE_URL must be explicitly provided (via option or RESTORE_DATABASE_URL environment variable). Implicit fallback to DATABASE_URL is strictly forbidden to prevent accidental destruction of production data.',
      );
    }

    let targetDbName = '';
    try {
      const parsedUrl = new URL(targetDbUrl);
      targetDbName = parsedUrl.pathname.replace(/^\//, '') || '';
    } catch (urlErr) {
      throw new Error(`[RESTORE ERROR] Invalid target database URL format: ${urlErr.message}`);
    }
    if (!targetDbName) {
      throw new Error('[RESTORE ERROR] Target database name could not be parsed from RESTORE_DATABASE_URL.');
    }

    // 2. SAFETY GUARD: Enforce explicit backup file path (reject automatic folder scanning)
    const backupFilePath = options.backupFilePath || process.env.RESTORE_FILE_PATH;
    if (!backupFilePath || typeof backupFilePath !== 'string' || !backupFilePath.trim()) {
      throw new Error(
        '[RESTORE SAFETY GUARD] RESTORE_FILE_PATH must be explicitly declared (via option or RESTORE_FILE_PATH environment variable). Automatic discovery/scanning of backup files is disabled for production safety.',
      );
    }

    if (!existsSync(backupFilePath)) {
      throw new Error(`[RESTORE ERROR] Specified backup file does not exist: ${backupFilePath}`);
    }

    // 3. DRILL GUARD: If drill mode is requested, ensure target DB is an isolated drill/test database
    const isDrillMode = options.isDrillMode === true || process.env.RESTORE_DRILL_MODE === 'true';
    if (isDrillMode) {
      const isIsolatedDb =
        targetDbName.includes('drill') ||
        targetDbName.includes('test') ||
        targetDbName.includes('isolated') ||
        targetDbName.includes('rehearsal') ||
        targetDbName.startsWith('ocop_restore_');
      if (!isIsolatedDb) {
        throw new Error(
          `[RESTORE DRILL GUARD] Rehearsal drill mode was requested, but destination database '${targetDbName}' is not recognized as an isolated drill database. Restoration refused to protect target database.`,
        );
      }
    }

    // 4. SAFETY GUARD: Validate against trusted .sha256 manifest BEFORE executing pg_restore --clean
    const manifestPath =
      options.manifestSha256Path || process.env.RESTORE_SHA256_FILE || `${backupFilePath}.sha256`;
    if (!existsSync(manifestPath)) {
      throw new Error(
        `[RESTORE SAFETY GUARD] Missing trusted manifest file at '${manifestPath}'. Refusing to execute pg_restore without verified checksum manifest.`,
      );
    }

    const manifestRaw = await readFile(manifestPath, 'utf8');
    const expectedChecksum = parseManifestSha256(manifestRaw);
    if (!expectedChecksum || !/^[a-f0-9]{64}$/i.test(expectedChecksum)) {
      throw new Error(
        `[RESTORE SAFETY GUARD] Malformed or invalid manifest format in '${manifestPath}'. Expected 64-hex SHA-256 hash.`,
      );
    }

    // Stream file directly into SHA-256 hash in constant O(1) RAM to prevent heap exhaustion on large dumps
    const actualChecksum = await computeFileSha256(backupFilePath);

    if (actualChecksum.toLowerCase() !== expectedChecksum.toLowerCase()) {
      throw new Error(
        `[RESTORE SAFETY GUARD] Checksum parity check FAILED! Manifest expects '${expectedChecksum}', but dump file computed '${actualChecksum}'. Restoration rejected before executing pg_restore.`,
      );
    }

    // 4b. AUTHENTICITY GUARD: Verify manifest cryptographic signature / origin
    const isProduction = process.env.NODE_ENV === 'production' || process.env.IS_PRODUCTION === 'true';
    const hmacSecret = options.manifestSecret || process.env.BACKUP_HMAC_SECRET;
    const signaturePath =
      options.signaturePath || process.env.RESTORE_SIGNATURE_FILE || `${manifestPath}.sig`;

    if (isProduction) {
      if (!hmacSecret || typeof hmacSecret !== 'string' || hmacSecret.trim().length < 16) {
        throw new Error(
          '[RESTORE AUTHENTICITY GUARD] In production, BACKUP_HMAC_SECRET is strictly required (minimum 16 characters). Refusing to restore without verified origin authenticity.',
        );
      }
      if (!existsSync(signaturePath)) {
        throw new Error(
          `[RESTORE AUTHENTICITY GUARD] Missing manifest signature file '${signaturePath}'. Production restore strictly requires a valid cryptographic signature.`,
        );
      }
      const signatureRaw = (await readFile(signaturePath, 'utf8')).trim();
      const isValid = verifyManifestSignature(manifestRaw, signatureRaw, hmacSecret);
      if (!isValid) {
        throw new Error(
          '[RESTORE AUTHENTICITY GUARD] Manifest cryptographic signature verification FAILED! The manifest may be forged or tampered.',
        );
      }
      console.log(`[PRODUCTION-RESTORE] Manifest Origin Authenticity: VERIFIED via HMAC signature (${signaturePath})`);
    } else if (hmacSecret || existsSync(signaturePath)) {
      if (!existsSync(signaturePath)) {
        throw new Error(
          `[RESTORE AUTHENTICITY GUARD] Missing manifest signature file '${signaturePath}'. Refusing to restore without verified origin authenticity.`,
        );
      }
      if (!hmacSecret) {
        throw new Error(
          '[RESTORE AUTHENTICITY GUARD] Manifest signature file exists, but BACKUP_HMAC_SECRET is missing to verify its authenticity.',
        );
      }
      const signatureRaw = (await readFile(signaturePath, 'utf8')).trim();
      const isValid = verifyManifestSignature(manifestRaw, signatureRaw, hmacSecret);
      if (!isValid) {
        throw new Error(
          '[RESTORE AUTHENTICITY GUARD] Manifest cryptographic signature verification FAILED! The manifest may be forged or tampered.',
        );
      }
      console.log(`[PRODUCTION-RESTORE] Manifest Origin Authenticity: VERIFIED via HMAC signature (${signaturePath})`);
    }

    console.log('\n[PRODUCTION-RESTORE] ========================================');
    console.log(`[PRODUCTION-RESTORE] Verified Archive: ${backupFilePath}`);
    console.log(`[PRODUCTION-RESTORE] Manifest Verified: ${manifestPath}`);
    console.log(`[PRODUCTION-RESTORE] SHA-256 Parity: ${actualChecksum} (MATCH)`);
    console.log(`[PRODUCTION-RESTORE] Target Database: ${targetDbName} (${targetDbUrl.replace(/:[^:@]+@/, ':***@')})`);
    console.log(`[PRODUCTION-RESTORE] Drill Mode: ${isDrillMode ? 'ACTIVE (Isolated Rehearsal)' : 'STANDARD'}`);
    console.log('[PRODUCTION-RESTORE] ========================================\n');

    // Dry run mode: exit before executing pg_restore or altering any state
    if (options.dryRun === true || process.env.RESTORE_DRY_RUN === 'true') {
      console.log('[RESTORE DRY-RUN] All safety guards passed. Dry-run mode active: skipping pg_restore and migrations.\n');
      return {
        success: true,
        dryRun: true,
        backupFilePath,
        manifestPath,
        targetDbName,
        checksum: actualChecksum,
      };
    }

    // 5. Execute pg_restore with clean replace
    console.log('[RESTORE STEP 2] Executing pg_restore with clean replace...');
    let restored = false;
    try {
      const pgRestoreCmd = process.platform === 'win32' ? 'pg_restore.exe' : 'pg_restore';
      execFileSync(pgRestoreCmd, ['--version'], { stdio: 'ignore' });
      execFileSync(
        pgRestoreCmd,
        [
          '--dbname', targetDbUrl,
          '--clean',
          '--if-exists',
          '--no-owner',
          '--no-privileges',
          backupFilePath,
        ],
        { stdio: 'inherit' },
      );
      restored = true;
    } catch (hostErr) {
      if (hostErr.code === 'ENOENT') {
        const urlObj = new URL(targetDbUrl);
        const dbName = urlObj.pathname.replace(/^\//, '') || 'postgres';
        const user = urlObj.username || 'postgres';

        // Check if matching backup container image exists with pg_restore 16
        let usedImage = false;
        try {
          execFileSync('docker', ['image', 'inspect', 'ocop-backend:staging-backup'], { stdio: 'ignore' });
          usedImage = true;
        } catch {
          usedImage = false;
        }

        if (usedImage) {
          console.log('[RESTORE] pg_restore not on host PATH. Executing via matching container image ocop-backend:staging-backup...');
          const containerDbUrlObj = new URL(targetDbUrl);
          if (containerDbUrlObj.hostname === 'localhost' || containerDbUrlObj.hostname === '127.0.0.1') {
            containerDbUrlObj.hostname = 'ocop-postgres';
          }
          execFileSync('docker', [
            'run', '--rm',
            '-v', `${backupFilePath}:/tmp/restore.dump`,
            '--network', 'ocop_default',
            '--entrypoint', 'pg_restore',
            'ocop-backend:staging-backup',
            '--dbname', containerDbUrlObj.toString(),
            '--clean',
            '--if-exists',
            '-O',
            '-x',
            '/tmp/restore.dump',
          ], { stdio: 'inherit' });
          restored = true;
        } else {
          console.log('[RESTORE] pg_restore not on host PATH. Executing via docker container ocop-postgres...');
          const containerDumpPath = `/tmp/restore_${Date.now()}.dump`;

          execFileSync('docker', ['cp', backupFilePath, `ocop-postgres:${containerDumpPath}`]);
          try {
            execFileSync('docker', [
              'exec', 'ocop-postgres',
              'pg_restore',
              '-U', user,
              '-d', dbName,
              '--clean',
              '--if-exists',
              '-O',
              '-x',
              containerDumpPath,
            ], { stdio: 'inherit' });
          } finally {
            execFileSync('docker', ['exec', 'ocop-postgres', 'rm', '-f', containerDumpPath]);
          }
          restored = true;
        }
      } else {
        throw hostErr;
      }
    }
    console.log('[RESTORE STEP 2] pg_restore execution completed.');

    // 6. Verify schema migration status using Prisma
    console.log('[RESTORE STEP 3] Running prisma migrate status against restored database...');
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const migrateStatusOutput = execFileSync(npxCmd, ['prisma', 'migrate', 'status'], {
      cwd: join(__dirname, '..'),
      env: {
        ...process.env,
        DATABASE_URL: targetDbUrl,
      },
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    console.log(migrateStatusOutput);

    if (!migrateStatusOutput.includes('Database schema is up to date!')) {
      throw new Error('Restored database schema verification failed: schema is not up to date.');
    }

    console.log('\n[PRODUCTION-RESTORE] SUCCESS: Database restored cleanly and verified with Prisma migrations.\n');
    return {
      success: true,
      backupFilePath,
      manifestPath,
      targetDbName,
      checksum: actualChecksum,
    };
  } catch (err) {
    console.error('\n[PRODUCTION-RESTORE CRITICAL FAILURE]', err.message);
    if (isDirect) {
      process.exit(1);
    }
    throw err;
  }
}

// Auto-run when executed directly from CLI
if (process.argv[1] && process.argv[1].endsWith('production-restore.mjs')) {
  runProductionRestore({ isDirect: true }).catch((err) => {
    console.error('\n[PRODUCTION-RESTORE ERROR]', err?.message || err);
    process.exit(1);
  });
}
