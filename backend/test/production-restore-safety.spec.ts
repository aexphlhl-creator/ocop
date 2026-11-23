import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { createHash, createHmac } from 'crypto';
import { pathToFileURL } from 'url';

const execFileAsync = promisify(execFile);

describe('Production Restore Safety Guards & Manifest Parity Probes', () => {
  const restoreScriptPath = path.resolve(__dirname, '../scripts/production-restore.mjs');
  const backupScriptPath = path.resolve(__dirname, '../scripts/production-backup.mjs');
  const scratchDir = path.resolve(__dirname, 'scratch-restore-safety');

  beforeAll(() => {
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(scratchDir)) {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  function computeSha256(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  describe('RESTORE_DATABASE_URL Guard (Refuse Implicit Fallback)', () => {
    it('MUST fail with exit code 1 when RESTORE_DATABASE_URL is missing, refusing fallback to DATABASE_URL', async () => {
      const dummyFile = path.join(scratchDir, 'test_no_db.dump');
      fs.writeFileSync(dummyFile, 'dummy dump content');

      let failed = false;
      try {
        await execFileAsync('node', [restoreScriptPath], {
          env: {
            ...process.env,
            DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ocop_vietnam',
            RESTORE_DATABASE_URL: '',
            RESTORE_FILE_PATH: dummyFile,
          },
        });
      } catch (err: any) {
        failed = true;
        expect(err.code).toBe(1);
        const combined = (err.stdout || '') + (err.stderr || '');
        expect(combined).toContain('[RESTORE SAFETY GUARD]');
        expect(combined).toContain('RESTORE_DATABASE_URL must be explicitly provided');
        expect(combined).toContain('Implicit fallback to DATABASE_URL is strictly forbidden');
      }
      expect(failed).toBe(true);
    });

    it('MUST fail when RESTORE_DATABASE_URL is malformed or missing database name', async () => {
      const dummyFile = path.join(scratchDir, 'test_malformed_url.dump');
      fs.writeFileSync(dummyFile, 'dummy dump content');

      let failed = false;
      try {
        await execFileAsync('node', [restoreScriptPath], {
          env: {
            ...process.env,
            RESTORE_DATABASE_URL: 'invalid-url-format',
            RESTORE_FILE_PATH: dummyFile,
          },
        });
      } catch (err: any) {
        failed = true;
        expect(err.code).toBe(1);
        const combined = (err.stdout || '') + (err.stderr || '');
        expect(combined).toContain('Invalid target database URL format');
      }
      expect(failed).toBe(true);
    });
  });

  describe('RESTORE_FILE_PATH Guard (Refuse Auto-Scanning)', () => {
    it('MUST fail with exit code 1 when RESTORE_FILE_PATH is missing', async () => {
      let failed = false;
      try {
        await execFileAsync('node', [restoreScriptPath], {
          env: {
            ...process.env,
            RESTORE_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ocop_restore_test',
            RESTORE_FILE_PATH: '',
          },
        });
      } catch (err: any) {
        failed = true;
        expect(err.code).toBe(1);
        const combined = (err.stdout || '') + (err.stderr || '');
        expect(combined).toContain('[RESTORE SAFETY GUARD]');
        expect(combined).toContain('RESTORE_FILE_PATH must be explicitly declared');
      }
      expect(failed).toBe(true);
    });

    it('MUST fail with exit code 1 when specified backup file does not exist', async () => {
      let failed = false;
      const nonExistent = path.join(scratchDir, 'ghost_archive.dump');
      try {
        await execFileAsync('node', [restoreScriptPath], {
          env: {
            ...process.env,
            RESTORE_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ocop_restore_test',
            RESTORE_FILE_PATH: nonExistent,
          },
        });
      } catch (err: any) {
        failed = true;
        expect(err.code).toBe(1);
        const combined = (err.stdout || '') + (err.stderr || '');
        expect(combined).toContain('Specified backup file does not exist');
      }
      expect(failed).toBe(true);
    });
  });

  describe('Trusted .sha256 Manifest Parity Guards', () => {
    it('MUST fail with exit code 1 before running pg_restore if .sha256 manifest is missing', async () => {
      const dumpFile = path.join(scratchDir, 'missing_manifest.dump');
      fs.writeFileSync(dumpFile, 'valid dump content');

      let failed = false;
      try {
        await execFileAsync('node', [restoreScriptPath], {
          env: {
            ...process.env,
            RESTORE_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ocop_restore_test',
            RESTORE_FILE_PATH: dumpFile,
            RESTORE_SHA256_FILE: '',
          },
        });
      } catch (err: any) {
        failed = true;
        expect(err.code).toBe(1);
        const combined = (err.stdout || '') + (err.stderr || '');
        expect(combined).toContain('[RESTORE SAFETY GUARD]');
        expect(combined).toContain('Missing trusted manifest file');
      }
      expect(failed).toBe(true);
    });

    it('MUST fail with exit code 1 if manifest format is malformed or invalid hex', async () => {
      const dumpFile = path.join(scratchDir, 'malformed_manifest.dump');
      const manifestFile = `${dumpFile}.sha256`;
      fs.writeFileSync(dumpFile, 'valid dump content');
      fs.writeFileSync(manifestFile, 'not-a-valid-sha256-string');

      let failed = false;
      try {
        await execFileAsync('node', [restoreScriptPath], {
          env: {
            ...process.env,
            RESTORE_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ocop_restore_test',
            RESTORE_FILE_PATH: dumpFile,
          },
        });
      } catch (err: any) {
        failed = true;
        expect(err.code).toBe(1);
        const combined = (err.stdout || '') + (err.stderr || '');
        expect(combined).toContain('[RESTORE SAFETY GUARD]');
        expect(combined).toContain('Malformed or invalid manifest format');
      }
      expect(failed).toBe(true);
    });

    it('MUST fail with exit code 1 if checksum does NOT match manifest (corrupted or tampered dump)', async () => {
      const dumpFile = path.join(scratchDir, 'corrupted.dump');
      const manifestFile = `${dumpFile}.sha256`;
      fs.writeFileSync(dumpFile, 'actual dump content from disk');
      // Create manifest with a different valid SHA-256 hash
      const mismatchedHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      fs.writeFileSync(manifestFile, `${mismatchedHash}  corrupted.dump\n`);

      let failed = false;
      try {
        await execFileAsync('node', [restoreScriptPath], {
          env: {
            ...process.env,
            RESTORE_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ocop_restore_test',
            RESTORE_FILE_PATH: dumpFile,
          },
        });
      } catch (err: any) {
        failed = true;
        expect(err.code).toBe(1);
        const combined = (err.stdout || '') + (err.stderr || '');
        expect(combined).toContain('[RESTORE SAFETY GUARD]');
        expect(combined).toContain('Checksum parity check FAILED');
      }
      expect(failed).toBe(true);
    });
  });

  describe('Drill Rehearsal Isolation Guard', () => {
    it('MUST fail with exit code 1 if RESTORE_DRILL_MODE=true but target DB is production', async () => {
      const dumpFile = path.join(scratchDir, 'drill_prod.dump');
      const manifestFile = `${dumpFile}.sha256`;
      const content = Buffer.from('drill dump data');
      fs.writeFileSync(dumpFile, content);
      const hash = computeSha256(content);
      fs.writeFileSync(manifestFile, `${hash}  drill_prod.dump\n`);

      let failed = false;
      try {
        await execFileAsync('node', [restoreScriptPath], {
          env: {
            ...process.env,
            RESTORE_DRILL_MODE: 'true',
            RESTORE_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ocop_vietnam', // Production name!
            RESTORE_FILE_PATH: dumpFile,
          },
        });
      } catch (err: any) {
        failed = true;
        expect(err.code).toBe(1);
        const combined = (err.stdout || '') + (err.stderr || '');
        expect(combined).toContain('[RESTORE DRILL GUARD]');
        expect(combined).toContain('not recognized as an isolated drill database');
      }
      expect(failed).toBe(true);
    });

    it('MUST pass all validations in dry-run drill mode with isolated target database', async () => {
      const dumpFile = path.join(scratchDir, 'drill_safe.dump');
      const manifestFile = `${dumpFile}.sha256`;
      const content = Buffer.from('safe test data');
      fs.writeFileSync(dumpFile, content);
      const hash = computeSha256(content);
      fs.writeFileSync(manifestFile, `${hash}  drill_safe.dump\n`);

      const { stdout } = await execFileAsync('node', [restoreScriptPath], {
        env: {
          ...process.env,
          RESTORE_DRILL_MODE: 'true',
          RESTORE_DRY_RUN: 'true',
          RESTORE_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ocop_restore_test',
          RESTORE_FILE_PATH: dumpFile,
        },
      });

      expect(stdout).toContain('[PRODUCTION-RESTORE]');
      expect(stdout).toContain('Manifest Verified:');
      expect(stdout).toContain(`SHA-256 Parity: ${hash} (MATCH)`);
      expect(stdout).toContain('Drill Mode: ACTIVE (Isolated Rehearsal)');
      expect(stdout).toContain('[RESTORE DRY-RUN] All safety guards passed.');
    });
  });

  describe('Webhook Alerting & Token Masking Probes', () => {
    it('masks webhook URL containing sensitive tokens and paths in log output', async () => {
      const scriptUrl = pathToFileURL(backupScriptPath).href;
      const script = `
        import { maskWebhookUrl } from '${scriptUrl}';
        const slack = 'https://hooks.slack.com/services/T00000/B00000/SECRET_TOKEN_XYZ';
        const discord = 'https://discord.com/api/webhooks/123456/SECRET_TOKEN_ABC';
        const query = 'https://monitor.internal/alert?secret=TOP_SECRET';
        console.log('SLACK_MASKED:' + maskWebhookUrl(slack));
        console.log('DISCORD_MASKED:' + maskWebhookUrl(discord));
        console.log('QUERY_MASKED:' + maskWebhookUrl(query));
      `;
      const { stdout } = await execFileAsync('node', ['--input-type=module', '-e', script]);
      expect(stdout).toContain('SLACK_MASKED:https://hooks.slack.com/services/***');
      expect(stdout).not.toContain('SECRET_TOKEN_XYZ');
      expect(stdout).toContain('DISCORD_MASKED:https://discord.com/api/***');
      expect(stdout).not.toContain('SECRET_TOKEN_ABC');
      expect(stdout).toContain('QUERY_MASKED:https://monitor.internal/alert/***');
      expect(stdout).not.toContain('TOP_SECRET');
    });

    it('sendAlert inspects HTTP response status code and logs error on non-2xx', async () => {
      const scriptUrl = pathToFileURL(backupScriptPath).href;
      const script = `
        import { sendAlert } from '${scriptUrl}';
        const originalFetch = global.fetch;
        global.fetch = async () => ({
          ok: false,
          status: 502,
          statusText: 'Bad Gateway',
        });
        const res = await sendAlert('https://hooks.slack.com/services/SECRET', 'test message', 'test error');
        if (res.success === false && res.status === 502) {
          console.log('ALERT_NON_2XX_HANDLED_CORRECTLY');
        }
      `;
      const { stdout } = await execFileAsync('node', ['--input-type=module', '-e', script]);
      expect(stdout).toContain('ALERT_NON_2XX_HANDLED_CORRECTLY');
      expect(stdout).not.toContain('/services/SECRET');
    });
  });

  describe('S3 Configuration Fail-Fast & Production Hardening', () => {
    it('MUST fail fast in production if BACKUP_S3_ENDPOINT is missing or set to localhost', async () => {
      const scriptUrl = pathToFileURL(backupScriptPath).href;
      const script = `
        import { runProductionBackup } from '${scriptUrl}';
        process.env.NODE_ENV = 'production';
        process.env.BACKUP_HMAC_SECRET = 'valid-production-secret-16-chars';
        process.env.BACKUP_STORAGE_TYPE = 's3';
        process.env.BACKUP_S3_BUCKET = 'test-bucket';
        process.env.BACKUP_S3_ENDPOINT = 'localhost';
        try {
          await runProductionBackup({ isDirect: false, dbUrl: 'postgresql://postgres:postgres@localhost:5432/test' });
          console.log('UNEXPECTED_SUCCESS');
        } catch (err) {
          console.log('FAIL_FAST_CAUGHT:' + err.message);
        }
      `;
      const { stdout } = await execFileAsync('node', ['--input-type=module', '-e', script]);
      expect(stdout).toContain('FAIL_FAST_CAUGHT:[BACKUP S3 CONFIG ERROR] Insecure endpoint \'localhost\' is strictly forbidden in production.');
      expect(stdout).not.toContain('UNEXPECTED_SUCCESS');
    });

    it('MUST fail fast in production if credentials default to minioadmin or TLS is disabled', async () => {
      const scriptUrl = pathToFileURL(backupScriptPath).href;
      const script = `
        import { runProductionBackup } from '${scriptUrl}';
        process.env.NODE_ENV = 'production';
        process.env.BACKUP_HMAC_SECRET = 'valid-production-secret-16-chars';
        process.env.BACKUP_STORAGE_TYPE = 's3';
        process.env.BACKUP_S3_BUCKET = 'test-bucket';
        process.env.BACKUP_S3_ENDPOINT = 's3.ap-southeast-1.amazonaws.com';
        process.env.BACKUP_S3_ACCESS_KEY = 'minioadmin';
        process.env.BACKUP_S3_SECRET_KEY = 'minioadmin';
        try {
          await runProductionBackup({ isDirect: false, dbUrl: 'postgresql://postgres:postgres@localhost:5432/test' });
          console.log('UNEXPECTED_SUCCESS');
        } catch (err) {
          console.log('FAIL_FAST_CAUGHT:' + err.message);
        }
      `;
      const { stdout } = await execFileAsync('node', ['--input-type=module', '-e', script]);
      expect(stdout).toContain('Default insecure credential \'minioadmin\' is strictly forbidden in production.');
      expect(stdout).not.toContain('UNEXPECTED_SUCCESS');
    });
  });

  describe('Manifest Origin Authenticity vs Checksum Parity', () => {
    it('MUST fail with exit code 1 if manifest signature verification fails (forged/tampered manifest)', async () => {
      const dumpFile = path.join(scratchDir, 'auth_tampered.dump');
      const manifestFile = `${dumpFile}.sha256`;
      const signatureFile = `${manifestFile}.sig`;
      const content = Buffer.from('payload with valid checksum but forged signature');
      fs.writeFileSync(dumpFile, content);
      const hash = computeSha256(content);
      fs.writeFileSync(manifestFile, `${hash}  auth_tampered.dump\n`);
      // Forged invalid signature
      fs.writeFileSync(signatureFile, '0000000000000000000000000000000000000000000000000000000000000000\n');

      let failed = false;
      try {
        await execFileAsync('node', [restoreScriptPath], {
          env: {
            ...process.env,
            RESTORE_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ocop_restore_test',
            RESTORE_FILE_PATH: dumpFile,
            RESTORE_SIGNATURE_FILE: signatureFile,
            BACKUP_HMAC_SECRET: 'trusted-production-key',
          },
        });
      } catch (err: any) {
        failed = true;
        expect(err.code).toBe(1);
        const combined = (err.stdout || '') + (err.stderr || '');
        expect(combined).toContain('[RESTORE AUTHENTICITY GUARD]');
        expect(combined).toContain('Manifest cryptographic signature verification FAILED');
      }
      expect(failed).toBe(true);
    });

    it('MUST pass both checksum parity AND manifest origin authenticity when signature matches', async () => {
      const dumpFile = path.join(scratchDir, 'auth_valid.dump');
      const manifestFile = `${dumpFile}.sha256`;
      const signatureFile = `${manifestFile}.sig`;
      const content = Buffer.from('authentic verified payload');
      fs.writeFileSync(dumpFile, content);
      const hash = computeSha256(content);
      const manifestContent = `${hash}  auth_valid.dump\n`;
      fs.writeFileSync(manifestFile, manifestContent);

      const secret = 'valid-production-signing-key';
      // Generate genuine HMAC signature
      const validSig = createHmac('sha256', secret).update(manifestContent.trim()).digest('hex');
      fs.writeFileSync(signatureFile, validSig + '\n');

      const { stdout } = await execFileAsync('node', [restoreScriptPath], {
        env: {
          ...process.env,
          RESTORE_DRILL_MODE: 'true',
          RESTORE_DRY_RUN: 'true',
          RESTORE_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ocop_restore_test',
          RESTORE_FILE_PATH: dumpFile,
          RESTORE_SIGNATURE_FILE: signatureFile,
          BACKUP_HMAC_SECRET: secret,
        },
      });

      expect(stdout).toContain('Manifest Origin Authenticity: VERIFIED via HMAC signature');
      expect(stdout).toContain(`SHA-256 Parity: ${hash} (MATCH)`);
      expect(stdout).toContain('[RESTORE DRY-RUN] All safety guards passed.');
    });
    it('MUST fail in production if BACKUP_HMAC_SECRET is missing during backup execution', async () => {
      let failed = false;
      try {
        await execFileAsync('node', [backupScriptPath], {
          env: {
            ...process.env,
            NODE_ENV: 'production',
            DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ocop_test',
            BACKUP_STORAGE_TYPE: 'local',
            BACKUP_LOCAL_DIR: scratchDir,
            BACKUP_HMAC_SECRET: '',
          },
        });
      } catch (err: any) {
        failed = true;
        expect(err.code).toBe(1);
        const combined = (err.stdout || '') + (err.stderr || '');
        expect(combined).toContain('[BACKUP HMAC ERROR]');
        expect(combined).toContain('BACKUP_HMAC_SECRET is strictly required in production');
      }
      expect(failed).toBe(true);
    });

    it('MUST fail in production if BACKUP_HMAC_SECRET is under minimum length (< 16 chars)', async () => {
      let failed = false;
      try {
        await execFileAsync('node', [backupScriptPath], {
          env: {
            ...process.env,
            NODE_ENV: 'production',
            DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ocop_test',
            BACKUP_STORAGE_TYPE: 'local',
            BACKUP_LOCAL_DIR: scratchDir,
            BACKUP_HMAC_SECRET: 'short-key',
          },
        });
      } catch (err: any) {
        failed = true;
        expect(err.code).toBe(1);
        const combined = (err.stdout || '') + (err.stderr || '');
        expect(combined).toContain('[BACKUP HMAC ERROR]');
        expect(combined).toContain('minimum 16 characters');
      }
      expect(failed).toBe(true);
    });

    it('MUST fail in production restore if BACKUP_HMAC_SECRET is missing', async () => {
      const dumpFile = path.join(scratchDir, 'prod_restore_no_secret.dump');
      const manifestFile = `${dumpFile}.sha256`;
      const signatureFile = `${manifestFile}.sig`;
      const content = Buffer.from('prod content');
      fs.writeFileSync(dumpFile, content);
      const hash = computeSha256(content);
      fs.writeFileSync(manifestFile, `${hash}  prod_restore_no_secret.dump\n`);
      fs.writeFileSync(signatureFile, 'some-sig\n');

      let failed = false;
      try {
        await execFileAsync('node', [restoreScriptPath], {
          env: {
            ...process.env,
            NODE_ENV: 'production',
            RESTORE_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ocop_restore_test',
            RESTORE_FILE_PATH: dumpFile,
            RESTORE_SIGNATURE_FILE: signatureFile,
            BACKUP_HMAC_SECRET: '',
          },
        });
      } catch (err: any) {
        failed = true;
        expect(err.code).toBe(1);
        const combined = (err.stdout || '') + (err.stderr || '');
        expect(combined).toContain('[RESTORE AUTHENTICITY GUARD]');
        expect(combined).toContain('BACKUP_HMAC_SECRET is strictly required');
      }
      expect(failed).toBe(true);
    });

    it('MUST fail in production restore if manifest signature file is missing', async () => {
      const dumpFile = path.join(scratchDir, 'prod_restore_no_sig_file.dump');
      const manifestFile = `${dumpFile}.sha256`;
      const content = Buffer.from('prod content without sig');
      fs.writeFileSync(dumpFile, content);
      const hash = computeSha256(content);
      fs.writeFileSync(manifestFile, `${hash}  prod_restore_no_sig_file.dump\n`);

      let failed = false;
      try {
        await execFileAsync('node', [restoreScriptPath], {
          env: {
            ...process.env,
            NODE_ENV: 'production',
            RESTORE_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ocop_restore_test',
            RESTORE_FILE_PATH: dumpFile,
            BACKUP_HMAC_SECRET: 'production-secret-at-least-16-chars',
          },
        });
      } catch (err: any) {
        failed = true;
        expect(err.code).toBe(1);
        const combined = (err.stdout || '') + (err.stderr || '');
        expect(combined).toContain('[RESTORE AUTHENTICITY GUARD]');
        expect(combined).toContain('Missing manifest signature file');
      }
      expect(failed).toBe(true);
    });
  });

  describe('Rehearsal Source Database & Host Allowlist Guards', () => {
    const rehearsalScript = path.resolve(__dirname, '../scripts/rehearse-offsite-backup-restore.mjs');

    it('MUST fail with exit code 1 if REHEARSAL_SOURCE_DATABASE_URL is omitted', async () => {
      let failed = false;
      try {
        await execFileAsync('node', [rehearsalScript], {
          env: {
            ...process.env,
            DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ocop_vietnam',
            REHEARSAL_SOURCE_DATABASE_URL: '',
          },
        });
      } catch (err: any) {
        failed = true;
        expect(err.code).toBe(1);
        const combined = (err.stdout || '') + (err.stderr || '');
        expect(combined).toContain('[REHEARSAL SAFETY GUARD]');
        expect(combined).toContain('REHEARSAL_SOURCE_DATABASE_URL must be explicitly provided');
      }
      expect(failed).toBe(true);
    });

    it('MUST fail with exit code 1 if REHEARSAL_SOURCE_DATABASE_URL host is not in allowlist', async () => {
      let failed = false;
      try {
        await execFileAsync('node', [rehearsalScript], {
          env: {
            ...process.env,
            REHEARSAL_SOURCE_DATABASE_URL: 'postgresql://postgres:postgres@production-db.internal:5432/ocop_test',
          },
        });
      } catch (err: any) {
        failed = true;
        expect(err.code).toBe(1);
        const combined = (err.stdout || '') + (err.stderr || '');
        expect(combined).toContain('[REHEARSAL SAFETY GUARD]');
        expect(combined).toContain('Host \'production-db.internal\' is NOT in the verified staging/test allowlist');
      }
      expect(failed).toBe(true);
    });

    it('MUST fail with exit code 1 if REHEARSAL_SOURCE_DATABASE_URL database name is not in allowlist', async () => {
      let failed = false;
      try {
        await execFileAsync('node', [rehearsalScript], {
          env: {
            ...process.env,
            REHEARSAL_SOURCE_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/production_customer_data',
          },
        });
      } catch (err: any) {
        failed = true;
        expect(err.code).toBe(1);
        const combined = (err.stdout || '') + (err.stderr || '');
        expect(combined).toContain('[REHEARSAL SAFETY GUARD]');
        expect(combined).toContain('Database \'production_customer_data\' is NOT in the verified staging/test allowlist');
      }
      expect(failed).toBe(true);
    });

    it('MUST fail with exit code 1 if REHEARSAL_SOURCE_DATABASE_URL points to primary production database ocop_vietnam', async () => {
      let failed = false;
      try {
        await execFileAsync('node', [rehearsalScript], {
          env: {
            ...process.env,
            REHEARSAL_SOURCE_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ocop_vietnam',
          },
        });
      } catch (err: any) {
        failed = true;
        expect(err.code).toBe(1);
        const combined = (err.stdout || '') + (err.stderr || '');
        expect(combined).toContain('[REHEARSAL SAFETY GUARD]');
        expect(combined).toContain('is NOT in the verified staging/test allowlist');
      }
      expect(failed).toBe(true);
    });

    it('MUST fail closed and report residual resources if S3 audit check fails, never printing zero orphaned', async () => {
      const mockSecretPass = 'SecretVaultP@ssword987654321';
      let failed = false;
      try {
        await execFileAsync('node', [rehearsalScript], {
          env: {
            ...process.env,
            REHEARSAL_SOURCE_DATABASE_URL: `postgresql://postgres:${mockSecretPass}@localhost:5432/ocop_test`,
            SIMULATE_S3_AUDIT_FAILURE: 'true',
          },
        });
      } catch (err: any) {
        failed = true;
        expect(err.code).toBe(1);
        const combined = (err.stdout || '') + (err.stderr || '');

        // 1. Must fail closed with cleanup critical error
        expect(combined).toContain('[REHEARSAL CLEANUP CRITICAL ERROR]');
        expect(combined).toContain('S3 Cleanup');

        // 2. Must NEVER output "zero orphaned resources remaining"
        expect(combined).not.toContain('zero orphaned resources remaining');

        // 3. Must NEVER leak the database password in log outputs
        expect(combined).not.toContain(mockSecretPass);
        expect(combined).toContain('***');
      }
      expect(failed).toBe(true);
    });

    it('MUST correctly mask database passwords in URLs via maskDatabaseUrl', async () => {
      const scriptUrl = pathToFileURL(rehearsalScript).href;
      const script = `
        import { maskDatabaseUrl } from '${scriptUrl}';
        const url1 = 'postgresql://admin:TopSecretPassword@10.0.0.1:5432/prod_db';
        const url2 = 'postgres://user:p%40ss%3Aword@db-server.internal/dbname?sslmode=require';
        const url3 = 'invalid-url';
        console.log('URL1_MASKED:' + maskDatabaseUrl(url1));
        console.log('URL2_MASKED:' + maskDatabaseUrl(url2));
        console.log('URL3_MASKED:' + maskDatabaseUrl(url3));
      `;
      const { stdout } = await execFileAsync('node', ['--input-type=module', '-e', script]);
      expect(stdout).toContain('URL1_MASKED:postgresql://admin:***@10.0.0.1:5432/prod_db');
      expect(stdout).toContain('URL2_MASKED:postgres://user:***@db-server.internal/dbname?sslmode=require');
      expect(stdout).not.toContain('TopSecretPassword');
      expect(stdout).not.toContain('p%40ss%3Aword');
    });
  });

  describe('Kubernetes CronJob Manifest Static Validation', () => {
    it('MUST contain all required production environment variables and safety policies in postgres-backup-cronjob.yaml', () => {
      const cronJobYamlPath = path.resolve(__dirname, '../../deploy/k8s/postgres-backup-cronjob.yaml');
      expect(fs.existsSync(cronJobYamlPath)).toBe(true);

      const content = fs.readFileSync(cronJobYamlPath, 'utf8');

      // 1. Check non-root security context
      expect(content).toContain('runAsNonRoot: true');
      expect(content).toContain('runAsUser: 1000');
      expect(content).toContain('fsGroup: 1000');

      // 2. Check working directory
      expect(content).toContain('workingDir: /usr/src/app');

      // 3. Check NODE_ENV=production
      expect(content).toMatch(/name:\s*NODE_ENV\s+value:\s*"production"/);

      // 4. Check BACKUP_S3_USE_SSL=true
      expect(content).toMatch(/name:\s*BACKUP_S3_USE_SSL\s+value:\s*"true"/);

      // 5. Check BACKUP_HMAC_SECRET from Secret
      expect(content).toMatch(/name:\s*BACKUP_HMAC_SECRET[\s\S]+?key:\s*BACKUP_HMAC_SECRET/);

      // 6. Check BACKUP_S3_ENDPOINT is mandatory (does NOT have optional: true)
      const endpointSection = content.match(/name:\s*BACKUP_S3_ENDPOINT[\s\S]+?(?=- name:|$)/);
      expect(endpointSection).not.toBeNull();
      expect(endpointSection![0]).not.toContain('optional: true');
    });

    it('MUST contain valid Hourly CronJob configuration with schedule 0 * * * * for RPO <= 1h', () => {
      const hourlyCronJobYamlPath = path.resolve(__dirname, '../../deploy/k8s/postgres-backup-hourly-cronjob.yaml');
      expect(fs.existsSync(hourlyCronJobYamlPath)).toBe(true);

      const content = fs.readFileSync(hourlyCronJobYamlPath, 'utf8');

      // 1. Check Hourly schedule
      expect(content).toMatch(/schedule:\s*"0 \* \* \* \*"/);

      // 2. Check non-root security context
      expect(content).toContain('runAsNonRoot: true');
      expect(content).toContain('runAsUser: 1000');
      expect(content).toContain('fsGroup: 1000');

      // 3. Check working directory
      expect(content).toContain('workingDir: /usr/src/app');

      // 4. Check NODE_ENV=production
      expect(content).toMatch(/name:\s*NODE_ENV\s+value:\s*"production"/);

      // 5. Check BACKUP_S3_USE_SSL=true
      expect(content).toMatch(/name:\s*BACKUP_S3_USE_SSL\s+value:\s*"true"/);

      // 6. Check BACKUP_HMAC_SECRET from Secret
      expect(content).toMatch(/name:\s*BACKUP_HMAC_SECRET[\s\S]+?key:\s*BACKUP_HMAC_SECRET/);

      // 7. Check BACKUP_S3_ENDPOINT is mandatory
      const endpointSection = content.match(/name:\s*BACKUP_S3_ENDPOINT[\s\S]+?(?=- name:|$)/);
      expect(endpointSection).not.toBeNull();
      expect(endpointSection![0]).not.toContain('optional: true');

      // 8. Check BACKUP_TIER and S3 Prefix
      expect(content).toMatch(/name:\s*BACKUP_TIER\s+value:\s*"hourly"/);
      expect(content).toMatch(/name:\s*BACKUP_S3_PREFIX\s+value:\s*"hourly\/"/);
    });

    it('MUST contain valid Monitor CronJob configuration with schedule */15 * * * * and BACKUP_HMAC_SECRET', () => {
      const monitorCronJobYamlPath = path.resolve(__dirname, '../../deploy/k8s/postgres-backup-monitor-cronjob.yaml');
      expect(fs.existsSync(monitorCronJobYamlPath)).toBe(true);

      const content = fs.readFileSync(monitorCronJobYamlPath, 'utf8');

      // 1. Check schedule */15 * * * *
      expect(content).toMatch(/schedule:\s*"\*\/15 \* \* \* \*"/);

      // 2. Check non-root security context
      expect(content).toContain('runAsNonRoot: true');
      expect(content).toContain('runAsUser: 1000');
      expect(content).toContain('fsGroup: 1000');

      // 3. Check working directory
      expect(content).toContain('workingDir: /usr/src/app');

      // 4. Check BACKUP_HMAC_SECRET from Secret
      expect(content).toMatch(/name:\s*BACKUP_HMAC_SECRET[\s\S]+?key:\s*BACKUP_HMAC_SECRET/);

      // 5. Check S3 credentials and Webhook
      expect(content).toMatch(/name:\s*BACKUP_S3_ACCESS_KEY/);
      expect(content).toMatch(/name:\s*BACKUP_S3_SECRET_KEY/);
      expect(content).toMatch(/name:\s*BACKUP_ALERT_WEBHOOK_URL/);
    });
  });

  describe('Multi-Tier Retention Isolation Probes (Hourly vs Daily/Weekly/Monthly)', () => {
    const tierScratchDir = path.resolve(__dirname, 'scratch-tier-retention');

    beforeEach(() => {
      if (fs.existsSync(tierScratchDir)) {
        fs.rmSync(tierScratchDir, { recursive: true, force: true });
      }
      fs.mkdirSync(tierScratchDir, { recursive: true });
    });

    afterEach(() => {
      if (fs.existsSync(tierScratchDir)) {
        fs.rmSync(tierScratchDir, { recursive: true, force: true });
      }
    });

    it('MUST isolate hourly retention so that hourly pruning NEVER deletes daily, weekly, or monthly backups', async () => {
      const now = Date.now();
      const oneHourMs = 3600 * 1000;
      const oneDayMs = 24 * oneHourMs;

      // 1. Create simulated files of different tiers and ages
      // Hourly files:
      const hourlyOld = path.join(tierScratchDir, 'ocop_backup_hourly_2026-11-17T00-00-00-000Z.dump');
      const hourlyFresh = path.join(tierScratchDir, 'ocop_backup_hourly_2026-11-19T02-00-00-000Z.dump');

      // Daily files (3 days old, 10 days old):
      const daily3Days = path.join(tierScratchDir, 'ocop_backup_daily_2026-11-16T00-00-00-000Z.dump');
      const daily10Days = path.join(tierScratchDir, 'ocop_backup_daily_2026-11-09T00-00-00-000Z.dump');

      // Weekly file (25 days old):
      const weekly25Days = path.join(tierScratchDir, 'ocop_backup_weekly_2026-10-25T00-00-00-000Z.dump');

      // Monthly file (60 days old):
      const monthly60Days = path.join(tierScratchDir, 'ocop_backup_monthly_2026-09-20T00-00-00-000Z.dump');

      fs.writeFileSync(hourlyOld, 'dummy hourly old');
      fs.writeFileSync(hourlyFresh, 'dummy hourly fresh');
      fs.writeFileSync(daily3Days, 'dummy daily 3 days');
      fs.writeFileSync(daily10Days, 'dummy daily 10 days');
      fs.writeFileSync(weekly25Days, 'dummy weekly 25 days');
      fs.writeFileSync(monthly60Days, 'dummy monthly 60 days');

      // Adjust mtimes
      fs.utimesSync(hourlyOld, new Date(now - 30 * oneHourMs), new Date(now - 30 * oneHourMs)); // 30h old (> 24h)
      fs.utimesSync(hourlyFresh, new Date(now - 2 * oneHourMs), new Date(now - 2 * oneHourMs)); // 2h old
      fs.utimesSync(daily3Days, new Date(now - 3 * oneDayMs), new Date(now - 3 * oneDayMs)); // 3d old
      fs.utimesSync(daily10Days, new Date(now - 10 * oneDayMs), new Date(now - 10 * oneDayMs)); // 10d old
      fs.utimesSync(weekly25Days, new Date(now - 25 * oneDayMs), new Date(now - 25 * oneDayMs)); // 25d old
      fs.utimesSync(monthly60Days, new Date(now - 60 * oneDayMs), new Date(now - 60 * oneDayMs)); // 60d old

      // Execute hourly backup pruning (retentionHours = 24)
      const scriptUrl = pathToFileURL(backupScriptPath).href;
      const script = `
        import { runProductionBackup } from '${scriptUrl}';
        // Mock execution by directly invoking pruning or dry backup
        const res = await runProductionBackup({
          isDirect: false,
          tier: 'hourly',
          retentionHours: 24,
          localDir: '${tierScratchDir.replace(/\\/g, '/')}',
          storageType: 'local',
          dbUrl: 'postgresql://postgres:postgres@localhost:5432/ocop_test',
        });
        console.log('PRUNED_COUNT:' + res.prunedLocalCount);
      `;

      await execFileAsync('node', ['--input-type=module', '-e', script]);

      // Assertions:
      // 1. Expired hourly file MUST be deleted
      expect(fs.existsSync(hourlyOld)).toBe(false);

      // 2. Fresh hourly file MUST be preserved
      expect(fs.existsSync(hourlyFresh)).toBe(true);

      // 3. Daily files MUST NOT BE TOUCHED by hourly pruning!
      expect(fs.existsSync(daily3Days)).toBe(true);
      expect(fs.existsSync(daily10Days)).toBe(true);

      // 4. Weekly and Monthly files MUST NOT BE TOUCHED by hourly pruning!
      expect(fs.existsSync(weekly25Days)).toBe(true);
      expect(fs.existsSync(monthly60Days)).toBe(true);
    });

    it('MUST execute S3 retention pruning isolated to the specific tier prefix', async () => {
      const scriptUrl = pathToFileURL(backupScriptPath).href;
      const testBucket = `test-s3-tier-prune-${Date.now()}`;

      const script = `
        import * as Minio from 'minio';
        import { runProductionBackup } from '${scriptUrl}';

        const mc = new Minio.Client({
          endPoint: 'localhost',
          port: 9000,
          useSSL: false,
          accessKey: 'minioadmin',
          secretKey: 'minioadmin'
        });

        const bucket = '${testBucket}';
        await mc.makeBucket(bucket, 'us-east-1');

        // Seed S3 with objects in different prefixes
        await mc.putObject(bucket, 'daily/ocop_backup_daily_preserved.dump', Buffer.from('daily'));
        await mc.putObject(bucket, 'hourly/ocop_backup_hourly_current.dump', Buffer.from('hourly'));

        // Run backup with S3 storage for hourly tier
        const res = await runProductionBackup({
          isDirect: false,
          tier: 'hourly',
          s3Prefix: 'hourly/',
          retentionHours: 24,
          localDir: '${tierScratchDir.replace(/\\/g, '/')}',
          storageType: 's3',
          s3Bucket: bucket,
          s3Endpoint: 'localhost',
          s3Port: 9000,
          s3UseSSL: false,
          s3AccessKey: 'minioadmin',
          s3SecretKey: 'minioadmin',
          dbUrl: 'postgresql://postgres:postgres@localhost:5432/ocop_test',
        });

        // Verify daily object is completely intact
        const dailyStat = await mc.statObject(bucket, 'daily/ocop_backup_daily_preserved.dump');
        console.log('DAILY_PRESERVED:' + (dailyStat.size > 0));

        // Clean up bucket
        const stream = mc.listObjectsV2(bucket, '', true);
        const objs = [];
        await new Promise((res, rej) => {
          stream.on('data', o => objs.push(o.name));
          stream.on('error', rej);
          stream.on('end', res);
        });
        for (const o of objs) await mc.removeObject(bucket, o);
        await mc.removeBucket(bucket);
        console.log('S3_CLEANUP_DONE');
      `;

      const { stdout } = await execFileAsync('node', ['--input-type=module', '-e', script]);
      expect(stdout).toContain('DAILY_PRESERVED:true');
      expect(stdout).toContain('S3_CLEANUP_DONE');
    });

    it('MUST measure backup duration and warn when duration exceeds warning threshold', async () => {
      const scriptUrl = pathToFileURL(backupScriptPath).href;
      const script = `
        import { runProductionBackup } from '${scriptUrl}';
        const res = await runProductionBackup({
          isDirect: false,
          tier: 'hourly',
          durationAlertThresholdMs: 1, // Deliberately set to 1ms to trigger duration warning
          localDir: '${tierScratchDir.replace(/\\/g, '/')}',
          storageType: 'local',
          dbUrl: 'postgresql://postgres:postgres@localhost:5432/ocop_test',
        });
        console.log('DURATION_MEASURED:' + (res.durationMs > 0));
      `;
      const { stdout, stderr } = await execFileAsync('node', ['--input-type=module', '-e', script]);
      expect(stdout).toContain('DURATION_MEASURED:true');
      const combined = stdout + stderr;
      expect(combined).toContain('[BACKUP DURATION WARNING]');
      expect(combined).toContain('exceeded warning threshold');
    });

    it('MUST detect staleness and trigger alert when backup age exceeds maximum allowed threshold', async () => {
      const scriptUrl = pathToFileURL(backupScriptPath).href;
      const script = `
        import { checkBackupFreshness } from '${scriptUrl}';
        import * as fs from 'fs';
        import * as path from 'path';

        const dir = '${tierScratchDir.replace(/\\/g, '/')}';

        // Case 1: Empty directory -> Alert
        const emptyCheck = await checkBackupFreshness({ tier: 'hourly', localDir: dir });
        console.log('EMPTY_FRESH:' + emptyCheck.fresh);

        // Case 2: Stale file (3 hours old, threshold 90 min) -> Alert
        const staleFile = path.join(dir, 'ocop_backup_hourly_2026-11-19T00-00-00-000Z.dump');
        fs.writeFileSync(staleFile, 'stale dump');
        const now = Date.now();
        fs.utimesSync(staleFile, new Date(now - 180 * 60 * 1000), new Date(now - 180 * 60 * 1000));

        const staleCheck = await checkBackupFreshness({ tier: 'hourly', localDir: dir, maxAllowedAgeMinutes: 90 });
        console.log('STALE_FRESH:' + staleCheck.fresh);

        // Case 3: Fresh file (15 minutes old) -> Fresh OK
        const freshFile = path.join(dir, 'ocop_backup_hourly_2026-11-19T04-00-00-000Z.dump');
        fs.writeFileSync(freshFile, 'fresh dump');
        fs.utimesSync(freshFile, new Date(now - 15 * 60 * 1000), new Date(now - 15 * 60 * 1000));

        const freshCheck = await checkBackupFreshness({ tier: 'hourly', localDir: dir, maxAllowedAgeMinutes: 90 });
        console.log('FRESH_OK:' + freshCheck.fresh);
      `;
      const { stdout, stderr } = await execFileAsync('node', ['--input-type=module', '-e', script]);
      expect(stdout).toContain('EMPTY_FRESH:false');
      expect(stdout).toContain('STALE_FRESH:false');
      expect(stdout).toContain('FRESH_OK:true');
      const combined = stdout + stderr;
      expect(combined).toContain('[BACKUP FRESHNESS ALERT]');
      expect(combined).toContain('[BACKUP STALENESS ALERT]');
      expect(combined).toContain('[BACKUP FRESHNESS OK]');
    });
  });

  describe('Independent S3 Backup & Freshness Monitor Probes', () => {
    const monitorScriptPath = path.resolve(__dirname, '../scripts/monitor-backup-s3.mjs');
    const monitorScriptUrl = pathToFileURL(monitorScriptPath).href;

    it('MUST detect upload failure (zero-byte dump or missing companion manifest) on S3', async () => {
      const script = `
        import { EventEmitter } from 'events';
        import { checkS3TierBackup } from '${monitorScriptUrl}';

        // Mock S3 client with an incomplete backup
        const mockObjects = [
          { name: 'hourly/ocop_backup_hourly_2026-11-19T06-00-00-000Z.dump', size: 0, lastModified: new Date() }, // 0-byte dump
          { name: 'hourly/ocop_backup_hourly_2026-11-19T05-00-00-000Z.dump', size: 5000, lastModified: new Date() }, // dump without manifest
        ];

        const mockS3Client = {
          listObjectsV2: () => {
            const ee = new EventEmitter();
            process.nextTick(() => {
              for (const obj of mockObjects) ee.emit('data', obj);
              ee.emit('end');
            });
            return ee;
          }
        };

        const result = await checkS3TierBackup(mockS3Client, 'test-bucket', 'hourly', {
          s3Prefix: 'hourly/',
          now: Date.now(),
        });

        console.log('STATUS:' + result.status);
        console.log('INCOMPLETE_COUNT:' + result.incompleteBackupsCount);
        console.log('ISSUES_COUNT:' + result.issues.length);
        console.log('HAS_UPLOAD_INCOMPLETE:' + result.issues.some(i => i.code === 'UPLOAD_INCOMPLETE'));
      `;

      const { stdout } = await execFileAsync('node', ['--input-type=module', '-e', script]);
      expect(stdout).toContain('STATUS:CRITICAL'); // Zero valid backups + incomplete
      expect(stdout).toContain('INCOMPLETE_COUNT:2');
      expect(stdout).toContain('HAS_UPLOAD_INCOMPLETE:true');
    });

    it('MUST fail with CRITICAL (MISSING_SIGNATURE) if .sig signature file is missing from triplet', async () => {
      const script = `
        import { EventEmitter } from 'events';
        import { checkS3TierBackup } from '${monitorScriptUrl}';

        // Has dump and sha256 manifest, but missing .sig
        const mockObjects = [
          { name: 'hourly/ocop_backup_hourly_2026-11-19T09-00-00-000Z.dump', size: 5000, lastModified: new Date() },
          { name: 'hourly/ocop_backup_hourly_2026-11-19T09-00-00-000Z.dump.sha256', size: 100, lastModified: new Date() },
        ];

        const mockS3Client = {
          listObjectsV2: () => {
            const ee = new EventEmitter();
            process.nextTick(() => {
              for (const obj of mockObjects) ee.emit('data', obj);
              ee.emit('end');
            });
            return ee;
          }
        };

        const result = await checkS3TierBackup(mockS3Client, 'test-bucket', 'hourly', {
          s3Prefix: 'hourly/',
          now: Date.now(),
        });

        console.log('STATUS:' + result.status);
        console.log('HAS_MISSING_SIGNATURE:' + result.issues.some(i => i.code === 'MISSING_SIGNATURE'));
      `;

      const { stdout } = await execFileAsync('node', ['--input-type=module', '-e', script]);
      expect(stdout).toContain('STATUS:CRITICAL');
      expect(stdout).toContain('HAS_MISSING_SIGNATURE:true');
    });

    it('MUST fail with CRITICAL (SHA256_PARITY_MISMATCH) if dump content is tampered despite having manifest and sig', async () => {
      const script = `
        import { EventEmitter } from 'events';
        import { createHmac } from 'crypto';
        import { checkS3TierBackup } from '${monitorScriptUrl}';

        const secret = 'valid-test-hmac-secret-16chars';
        const originalContent = 'authentic original database dump';
        const tamperedContent = 'tampered malicious database dump';
        const expectedHash = (await import('crypto')).createHash('sha256').update(originalContent).digest('hex');
        const manifestText = expectedHash + '  ocop_backup_hourly_2026-11-19T09-00-00-000Z.dump\\n';
        const sigText = createHmac('sha256', secret).update(manifestText.trim()).digest('hex');

        const mockObjects = [
          { name: 'hourly/ocop_backup_hourly_2026-11-19T09-00-00-000Z.dump', size: tamperedContent.length, lastModified: new Date() },
          { name: 'hourly/ocop_backup_hourly_2026-11-19T09-00-00-000Z.dump.sha256', size: manifestText.length, lastModified: new Date() },
          { name: 'hourly/ocop_backup_hourly_2026-11-19T09-00-00-000Z.dump.sha256.sig', size: sigText.length, lastModified: new Date() },
        ];

        const mockS3Client = {
          listObjectsV2: () => {
            const ee = new EventEmitter();
            process.nextTick(() => {
              for (const obj of mockObjects) ee.emit('data', obj);
              ee.emit('end');
            });
            return ee;
          },
          getObject: async (bucket, name) => {
            if (name.endsWith('.dump')) return Buffer.from(tamperedContent);
            if (name.endsWith('.sha256')) return Buffer.from(manifestText);
            if (name.endsWith('.sha256.sig')) return Buffer.from(sigText);
            throw new Error('Not found: ' + name);
          }
        };

        const result = await checkS3TierBackup(mockS3Client, 'test-bucket', 'hourly', {
          s3Prefix: 'hourly/',
          now: Date.now(),
          hmacSecret: secret,
        });

        console.log('STATUS:' + result.status);
        console.log('HAS_SHA256_MISMATCH:' + result.issues.some(i => i.code === 'SHA256_PARITY_MISMATCH'));
        console.log('INTEGRITY_VERIFIED:' + (result.latestBackup ? result.latestBackup.integrityVerified : false));
      `;

      const { stdout } = await execFileAsync('node', ['--input-type=module', '-e', script]);
      expect(stdout).toContain('STATUS:CRITICAL');
      expect(stdout).toContain('HAS_SHA256_MISMATCH:true');
      expect(stdout).toContain('INTEGRITY_VERIFIED:false');
    });

    it('MUST fail with CRITICAL (HMAC_SIGNATURE_MISMATCH) if HMAC signature is invalid or forged', async () => {
      const script = `
        import { EventEmitter } from 'events';
        import { checkS3TierBackup } from '${monitorScriptUrl}';

        const secret = 'valid-test-hmac-secret-16chars';
        const dumpContent = 'authentic original database dump';
        const expectedHash = (await import('crypto')).createHash('sha256').update(dumpContent).digest('hex');
        const manifestText = expectedHash + '  ocop_backup_hourly_2026-11-19T09-00-00-000Z.dump\\n';
        const badSigText = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

        const mockObjects = [
          { name: 'hourly/ocop_backup_hourly_2026-11-19T09-00-00-000Z.dump', size: dumpContent.length, lastModified: new Date() },
          { name: 'hourly/ocop_backup_hourly_2026-11-19T09-00-00-000Z.dump.sha256', size: manifestText.length, lastModified: new Date() },
          { name: 'hourly/ocop_backup_hourly_2026-11-19T09-00-00-000Z.dump.sha256.sig', size: badSigText.length, lastModified: new Date() },
        ];

        const mockS3Client = {
          listObjectsV2: () => {
            const ee = new EventEmitter();
            process.nextTick(() => {
              for (const obj of mockObjects) ee.emit('data', obj);
              ee.emit('end');
            });
            return ee;
          },
          getObject: async (bucket, name) => {
            if (name.endsWith('.dump')) return Buffer.from(dumpContent);
            if (name.endsWith('.sha256')) return Buffer.from(manifestText);
            if (name.endsWith('.sha256.sig')) return Buffer.from(badSigText);
            throw new Error('Not found: ' + name);
          }
        };

        const result = await checkS3TierBackup(mockS3Client, 'test-bucket', 'hourly', {
          s3Prefix: 'hourly/',
          now: Date.now(),
          hmacSecret: secret,
        });

        console.log('STATUS:' + result.status);
        console.log('HAS_HMAC_MISMATCH:' + result.issues.some(i => i.code === 'HMAC_SIGNATURE_MISMATCH'));
        console.log('INTEGRITY_VERIFIED:' + (result.latestBackup ? result.latestBackup.integrityVerified : false));
      `;

      const { stdout } = await execFileAsync('node', ['--input-type=module', '-e', script]);
      expect(stdout).toContain('STATUS:CRITICAL');
      expect(stdout).toContain('HAS_HMAC_MISMATCH:true');
      expect(stdout).toContain('INTEGRITY_VERIFIED:false');
    });

    it('MUST detect missed CronJob when no new backup has been uploaded within schedule interval', async () => {
      const script = `
        import { EventEmitter } from 'events';
        import { createHmac, createHash } from 'crypto';
        import { checkS3TierBackup } from '${monitorScriptUrl}';

        const secret = 'valid-test-hmac-secret-16chars';
        const content = 'valid old database dump';
        const hash = createHash('sha256').update(content).digest('hex');
        const manifestText = hash + '  ocop_backup_hourly_2026-11-19T08-00-00-000Z.dump\\n';
        const sigText = createHmac('sha256', secret).update(manifestText.trim()).digest('hex');

        const now = new Date('2026-11-19T10:00:00.000Z').getTime();
        // Last valid backup was at 08:00:00 (120 minutes ago, for an hourly job with 70 min threshold)
        const mockObjects = [
          { name: 'hourly/ocop_backup_hourly_2026-11-19T08-00-00-000Z.dump', size: content.length, lastModified: new Date('2026-11-19T08:00:00.000Z') },
          { name: 'hourly/ocop_backup_hourly_2026-11-19T08-00-00-000Z.dump.sha256', size: manifestText.length, lastModified: new Date('2026-11-19T08:00:00.000Z') },
          { name: 'hourly/ocop_backup_hourly_2026-11-19T08-00-00-000Z.dump.sha256.sig', size: sigText.length, lastModified: new Date('2026-11-19T08:00:00.000Z') },
        ];

        const mockS3Client = {
          listObjectsV2: () => {
            const ee = new EventEmitter();
            process.nextTick(() => {
              for (const obj of mockObjects) ee.emit('data', obj);
              ee.emit('end');
            });
            return ee;
          },
          getObject: async (bucket, name) => {
            if (name.endsWith('.dump')) return Buffer.from(content);
            if (name.endsWith('.sha256')) return Buffer.from(manifestText);
            if (name.endsWith('.sha256.sig')) return Buffer.from(sigText);
            throw new Error('Not found: ' + name);
          }
        };

        const result = await checkS3TierBackup(mockS3Client, 'test-bucket', 'hourly', {
          s3Prefix: 'hourly/',
          now,
          expectedIntervalMinutes: 60,
          missedGracePeriodMinutes: 10, // Missed threshold: 70m
          rpoTargetMinutes: 60,
          hmacSecret: secret,
        });

        console.log('STATUS:' + result.status);
        console.log('HAS_CRONJOB_MISSED:' + result.issues.some(i => i.code === 'CRONJOB_MISSED'));
        console.log('HAS_RPO_BREACH:' + result.issues.some(i => i.code === 'RPO_BREACH'));
      `;

      const { stdout } = await execFileAsync('node', ['--input-type=module', '-e', script]);
      expect(stdout).toContain('STATUS:CRITICAL');
      expect(stdout).toContain('HAS_CRONJOB_MISSED:true');
      expect(stdout).toContain('HAS_RPO_BREACH:true');
    });

    it('MUST warn when backup freshness is approaching RPO target threshold', async () => {
      const script = `
        import { EventEmitter } from 'events';
        import { createHmac, createHash } from 'crypto';
        import { checkS3TierBackup } from '${monitorScriptUrl}';

        const secret = 'valid-test-hmac-secret-16chars';
        const content = 'valid database dump approaching rpo';
        const hash = createHash('sha256').update(content).digest('hex');
        const manifestText = hash + '  ocop_backup_hourly_2026-11-19T09-07-00-000Z.dump\\n';
        const sigText = createHmac('sha256', secret).update(manifestText.trim()).digest('hex');

        const now = new Date('2026-11-19T10:00:00.000Z').getTime();
        // Last valid backup was at 09:07:00 (53 minutes ago, warn at 50 min, breach at 60 min)
        const mockObjects = [
          { name: 'hourly/ocop_backup_hourly_2026-11-19T09-07-00-000Z.dump', size: content.length, lastModified: new Date('2026-11-19T09-07:00.000Z') },
          { name: 'hourly/ocop_backup_hourly_2026-11-19T09-07-00-000Z.dump.sha256', size: manifestText.length, lastModified: new Date('2026-11-19T09-07:00.000Z') },
          { name: 'hourly/ocop_backup_hourly_2026-11-19T09-07-00-000Z.dump.sha256.sig', size: sigText.length, lastModified: new Date('2026-11-19T09-07:00.000Z') },
        ];

        const mockS3Client = {
          listObjectsV2: () => {
            const ee = new EventEmitter();
            process.nextTick(() => {
              for (const obj of mockObjects) ee.emit('data', obj);
              ee.emit('end');
            });
            return ee;
          },
          getObject: async (bucket, name) => {
            if (name.endsWith('.dump')) return Buffer.from(content);
            if (name.endsWith('.sha256')) return Buffer.from(manifestText);
            if (name.endsWith('.sha256.sig')) return Buffer.from(sigText);
            throw new Error('Not found: ' + name);
          }
        };

        const result = await checkS3TierBackup(mockS3Client, 'test-bucket', 'hourly', {
          s3Prefix: 'hourly/',
          now,
          rpoWarnMinutes: 50,
          rpoTargetMinutes: 60,
          expectedIntervalMinutes: 60,
          missedGracePeriodMinutes: 10,
          hmacSecret: secret,
        });

        console.log('STATUS:' + result.status);
        console.log('HAS_RPO_APPROACHING:' + result.issues.some(i => i.code === 'RPO_APPROACHING'));
      `;

      const { stdout } = await execFileAsync('node', ['--input-type=module', '-e', script]);
      expect(stdout).toContain('STATUS:WARNING');
      expect(stdout).toContain('HAS_RPO_APPROACHING:true');
    });

    it('MUST report HEALTHY when valid backup triplet exists within RPO window and cryptographic verifications succeed', async () => {
      const script = `
        import { EventEmitter } from 'events';
        import { createHmac, createHash } from 'crypto';
        import { checkS3TierBackup } from '${monitorScriptUrl}';

        const secret = 'valid-test-hmac-secret-16chars';
        const content = 'fresh authentic database dump';
        const hash = createHash('sha256').update(content).digest('hex');
        const manifestText = hash + '  ocop_backup_hourly_2026-11-19T09-45-00-000Z.dump\\n';
        const sigText = createHmac('sha256', secret).update(manifestText.trim()).digest('hex');

        const now = new Date('2026-11-19T10:00:00.000Z').getTime();
        // Last valid backup was at 09:45:00 (15 minutes ago)
        const mockObjects = [
          { name: 'hourly/ocop_backup_hourly_2026-11-19T09-45-00-000Z.dump', size: content.length, lastModified: new Date('2026-11-19T09:45:00.000Z') },
          { name: 'hourly/ocop_backup_hourly_2026-11-19T09-45-00-000Z.dump.sha256', size: manifestText.length, lastModified: new Date('2026-11-19T09:45:00.000Z') },
          { name: 'hourly/ocop_backup_hourly_2026-11-19T09-45-00-000Z.dump.sha256.sig', size: sigText.length, lastModified: new Date('2026-11-19T09-45:00.000Z') },
        ];

        const mockS3Client = {
          listObjectsV2: () => {
            const ee = new EventEmitter();
            process.nextTick(() => {
              for (const obj of mockObjects) ee.emit('data', obj);
              ee.emit('end');
            });
            return ee;
          },
          getObject: async (bucket, name) => {
            if (name.endsWith('.dump')) return Buffer.from(content);
            if (name.endsWith('.sha256')) return Buffer.from(manifestText);
            if (name.endsWith('.sha256.sig')) return Buffer.from(sigText);
            throw new Error('Not found: ' + name);
          }
        };

        const result = await checkS3TierBackup(mockS3Client, 'test-bucket', 'hourly', {
          s3Prefix: 'hourly/',
          now,
          rpoWarnMinutes: 50,
          rpoTargetMinutes: 60,
          hmacSecret: secret,
        });

        console.log('STATUS:' + result.status);
        console.log('VALID_COUNT:' + result.validBackupsCount);
        console.log('ISSUES_COUNT:' + result.issues.length);
        console.log('INTEGRITY_VERIFIED:' + (result.latestBackup ? result.latestBackup.integrityVerified : false));
      `;

      const { stdout } = await execFileAsync('node', ['--input-type=module', '-e', script]);
      expect(stdout).toContain('STATUS:HEALTHY');
      expect(stdout).toContain('VALID_COUNT:1');
      expect(stdout).toContain('ISSUES_COUNT:0');
      expect(stdout).toContain('INTEGRITY_VERIFIED:true');
    });

    it('MUST compute SHA-256 via multi-chunk stream in constant RAM', async () => {
      const script = `
        import { Readable } from 'stream';
        import { createHash } from 'crypto';
        import { computeStreamSha256 } from '${monitorScriptUrl}';

        const chunks = [
          Buffer.from('chunk-1-data-'),
          Buffer.from('chunk-2-data-'),
          Buffer.from('chunk-3-data-'),
          Buffer.from('chunk-4-data-final'),
        ];
        const fullBuffer = Buffer.concat(chunks);
        const expectedHash = createHash('sha256').update(fullBuffer).digest('hex');

        // Create stream that emits multiple chunks
        const stream = new Readable({
          read() {
            if (chunks.length > 0) {
              this.push(chunks.shift());
            } else {
              this.push(null);
            }
          }
        });

        const computed = await computeStreamSha256(stream);
        console.log('HASH_MATCH:' + (computed === expectedHash));
      `;

      const { stdout } = await execFileAsync('node', ['--input-type=module', '-e', script]);
      expect(stdout).toContain('HASH_MATCH:true');
    });

    it('MUST stream large payload (10 MB) without RAM memory accumulation', async () => {
      const script = `
        import { Readable } from 'stream';
        import { createHash } from 'crypto';
        import { computeStreamSha256 } from '${monitorScriptUrl}';

        // 10 MB payload across 100 chunks of 100 KB
        const chunkCount = 100;
        const chunkSize = 100 * 1024;

        // Pre-compute expected hash deterministically
        const referenceHash = createHash('sha256');
        for (let i = 0; i < chunkCount; i++) {
          referenceHash.update(Buffer.alloc(chunkSize, i % 256));
        }
        const expectedHash = referenceHash.digest('hex');

        let pushed = 0;
        const stream = new Readable({
          read() {
            if (pushed < chunkCount) {
              this.push(Buffer.alloc(chunkSize, pushed % 256));
              pushed++;
            } else {
              this.push(null);
            }
          }
        });

        const computed = await computeStreamSha256(stream);
        console.log('LARGE_PAYLOAD_HASH_MATCH:' + (computed === expectedHash));
      `;

      const { stdout } = await execFileAsync('node', ['--input-type=module', '-e', script]);
      expect(stdout).toContain('LARGE_PAYLOAD_HASH_MATCH:true');
    });

    it('MUST fail verification and refuse HEALTHY status when stream aborts with error mid-stream', async () => {
      const script = `
        import { EventEmitter } from 'events';
        import { Readable } from 'stream';
        import { createHmac, createHash } from 'crypto';
        import { checkS3TierBackup } from '${monitorScriptUrl}';

        const secret = 'valid-test-hmac-secret-16chars';
        const dumpContent = 'data before stream failure';
        const hash = createHash('sha256').update(dumpContent).digest('hex');
        const manifestText = hash + '  ocop_backup_hourly_2026-11-19T09-45-00-000Z.dump\\n';
        const sigText = createHmac('sha256', secret).update(manifestText.trim()).digest('hex');

        const mockObjects = [
          { name: 'hourly/ocop_backup_hourly_2026-11-19T09-45-00-000Z.dump', size: 100000, lastModified: new Date() },
          { name: 'hourly/ocop_backup_hourly_2026-11-19T09-45-00-000Z.dump.sha256', size: manifestText.length, lastModified: new Date() },
          { name: 'hourly/ocop_backup_hourly_2026-11-19T09-45-00-000Z.dump.sha256.sig', size: sigText.length, lastModified: new Date() },
        ];

        // Create dump stream that emits one chunk and then errors mid-stream
        const failingStream = new Readable({
          read() {
            this.push(Buffer.from('partial-data-'));
            this.destroy(new Error('S3 socket abruptly closed / connection reset mid-stream'));
          }
        });

        const mockS3Client = {
          listObjectsV2: () => {
            const ee = new EventEmitter();
            process.nextTick(() => {
              for (const obj of mockObjects) ee.emit('data', obj);
              ee.emit('end');
            });
            return ee;
          },
          getObject: async (bucket, name) => {
            if (name.endsWith('.dump')) return failingStream;
            if (name.endsWith('.sha256')) return Buffer.from(manifestText);
            if (name.endsWith('.sha256.sig')) return Buffer.from(sigText);
            throw new Error('Not found: ' + name);
          }
        };

        const result = await checkS3TierBackup(mockS3Client, 'test-bucket', 'hourly', {
          s3Prefix: 'hourly/',
          now: Date.now(),
          hmacSecret: secret,
        });

        console.log('STATUS:' + result.status);
        console.log('HAS_STREAM_ERROR:' + result.issues.some(i => i.code === 'STREAM_VERIFICATION_ERROR'));
        console.log('INTEGRITY_VERIFIED:' + (result.latestBackup ? result.latestBackup.integrityVerified : false));
      `;

      const { stdout } = await execFileAsync('node', ['--input-type=module', '-e', script]);
      expect(stdout).toContain('STATUS:CRITICAL');
      expect(stdout).toContain('HAS_STREAM_ERROR:true');
      expect(stdout).toContain('INTEGRITY_VERIFIED:false');
    });

    it('MUST detect hanging stream and abort with timeout error refusing HEALTHY status', async () => {
      const script = `
        import { EventEmitter } from 'events';
        import { Readable } from 'stream';
        import { createHmac, createHash } from 'crypto';
        import { checkS3TierBackup, computeStreamSha256 } from '${monitorScriptUrl}';

        // Part 1: Verify stream running past 60s succeeds when chunks arrive steadily
        let virtualTime = 0;
        const timers = new Map();
        let timerId = 1;

        const origSetTimeout = globalThis.setTimeout;
        const origClearTimeout = globalThis.clearTimeout;

        globalThis.setTimeout = (fn, delay) => {
          const id = timerId++;
          timers.set(id, { fn, at: virtualTime + delay });
          return id;
        };
        globalThis.clearTimeout = (id) => timers.delete(id);

        const advanceTime = (ms) => {
          virtualTime += ms;
          const toRun = [];
          for (const [id, t] of timers.entries()) {
            if (t.at <= virtualTime) {
              timers.delete(id);
              toRun.push(t.fn);
            }
          }
          for (const fn of toRun) fn();
        };

        const longStreamText = 'chunk1-chunk2-chunk3-chunk4-chunk5-chunk6-chunk7-chunk8';
        const expectedLongHash = createHash('sha256').update(longStreamText).digest('hex');
        const chunks = longStreamText.split('-');
        let chunkIdx = 0;
        let steadyEnded = false;

        const steadyStreamPast60s = new Readable({
          read() {
            if (chunkIdx < chunks.length) {
              const c = chunks[chunkIdx++];
              this.push(Buffer.from(c + (chunkIdx < chunks.length ? '-' : '')));
              advanceTime(10000); // Advance 10s virtual time on each chunk -> total 80s (>60s)
            } else if (!steadyEnded) {
              steadyEnded = true;
              this.push(null);
            }
          }
        });

        const steadyHash = await computeStreamSha256(steadyStreamPast60s, {
          inactivityTimeoutMs: 60000,
          totalTimeoutMs: 120000,
        });

        console.log('STEADY_PAST_60S_SUCCESS:' + (steadyHash === expectedLongHash));
        console.log('STEADY_VIRTUAL_SECONDS:' + (virtualTime / 1000));

        // Part 2: Verify stream that stops sending chunks fails after 60s inactivity
        let pushedFirst = false;
        const stallingStream = new Readable({
          read() {
            if (!pushedFirst) {
              pushedFirst = true;
              this.push(Buffer.from('first-chunk-'));
              process.nextTick(() => {
                advanceTime(65000); // Stalls for 65s exceeding 60s inactivity limit
              });
            }
          }
        });

        let caughtStall = false;
        let stallCode = '';
        try {
          await computeStreamSha256(stallingStream, {
            inactivityTimeoutMs: 60000,
            totalTimeoutMs: 120000,
          });
        } catch (err) {
          caughtStall = true;
          stallCode = err.code || err.message;
        }

        console.log('CAUGHT_STALL:' + caughtStall);
        console.log('STALL_IS_INACTIVITY:' + stallCode.includes('STREAM_INACTIVITY_TIMEOUT'));

        // Restore real timers for integration test
        globalThis.setTimeout = origSetTimeout;
        globalThis.clearTimeout = origClearTimeout;

        // Part 3: Integration with checkS3TierBackup with real-time stalled stream
        const secret = 'valid-test-hmac-secret-16chars';
        const dumpContent = 'data before stream stalls';
        const hash = createHash('sha256').update(dumpContent).digest('hex');
        const manifestText = hash + '  ocop_backup_hourly_2026-11-19T09-45-00-000Z.dump\\n';
        const sigText = createHmac('sha256', secret).update(manifestText.trim()).digest('hex');

        const mockObjects = [
          { name: 'hourly/ocop_backup_hourly_2026-11-19T09-45-00-000Z.dump', size: 100000, lastModified: new Date() },
          { name: 'hourly/ocop_backup_hourly_2026-11-19T09-45-00-000Z.dump.sha256', size: manifestText.length, lastModified: new Date() },
          { name: 'hourly/ocop_backup_hourly_2026-11-19T09-45-00-000Z.dump.sha256.sig', size: sigText.length, lastModified: new Date() },
        ];

        let realPushed = false;
        const realHangingStream = new Readable({
          read() {
            if (!realPushed) {
              realPushed = true;
              this.push(Buffer.from('first-chunk-'));
            }
          }
        });

        const mockS3Client = {
          listObjectsV2: () => {
            const ee = new EventEmitter();
            process.nextTick(() => {
              for (const obj of mockObjects) ee.emit('data', obj);
              ee.emit('end');
            });
            return ee;
          },
          getObject: async (bucket, name) => {
            if (name.endsWith('.dump')) return realHangingStream;
            if (name.endsWith('.sha256')) return Buffer.from(manifestText);
            if (name.endsWith('.sha256.sig')) return Buffer.from(sigText);
            throw new Error('Not found: ' + name);
          }
        };

        const result = await checkS3TierBackup(mockS3Client, 'test-bucket', 'hourly', {
          s3Prefix: 'hourly/',
          now: Date.now(),
          hmacSecret: secret,
          inactivityTimeoutMs: 150, // Short timeout for test
        });

        console.log('STATUS:' + result.status);
        console.log('HAS_STREAM_TIMEOUT:' + result.issues.some(i => i.code === 'STREAM_VERIFICATION_ERROR' && i.message.includes('timed out')));
        console.log('INTEGRITY_VERIFIED:' + (result.latestBackup ? result.latestBackup.integrityVerified : false));
      `;

      const { stdout } = await execFileAsync('node', ['--input-type=module', '-e', script]);
      expect(stdout).toContain('STEADY_PAST_60S_SUCCESS:true');
      expect(stdout).toContain('STEADY_VIRTUAL_SECONDS:80');
      expect(stdout).toContain('CAUGHT_STALL:true');
      expect(stdout).toContain('STALL_IS_INACTIVITY:true');
      expect(stdout).toContain('STATUS:CRITICAL');
      expect(stdout).toContain('HAS_STREAM_TIMEOUT:true');
      expect(stdout).toContain('INTEGRITY_VERIFIED:false');
    });

    it('MUST handle webhook delivery failure gracefully without crashing monitor or suppressing critical status', async () => {
      const script = `
        import http from 'http';
        import { EventEmitter } from 'events';
        import { monitorS3Backups } from '${monitorScriptUrl}';

        // Mock failing webhook endpoint returning HTTP 500 using native Node http server
        const server = http.createServer((req, res) => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal Server Error' }));
        });

        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;
        const webhookUrl = 'http://127.0.0.1:' + port + '/backup-webhook';

        try {
          const mockS3Client = {
            bucketExists: async () => true,
            listObjectsV2: () => {
              const ee = new EventEmitter();
              process.nextTick(() => ee.emit('end')); // Zero backups triggers CRITICAL issue
              return ee;
            }
          };

          const report = await monitorS3Backups({
            isDirect: false,
            s3Client: mockS3Client,
            s3Bucket: 'test-bucket',
            tier: 'hourly',
            webhookUrl,
          });

          console.log('OVERALL_STATUS:' + report.overallStatus);
          console.log('ALERT_COUNT:' + report.alertsSent.length);
          console.log('DELIVERED_FALSE:' + report.alertsSent.some(a => a.delivered === false));
        } finally {
          server.close();
        }
      `;

      const { stdout, stderr } = await execFileAsync('node', ['--input-type=module', '-e', script]);
      expect(stdout).toContain('OVERALL_STATUS:CRITICAL');
      expect(stdout).toContain('ALERT_COUNT:1');
      expect(stdout).toContain('DELIVERED_FALSE:true');
      const combined = stdout + stderr;
      expect(combined).toContain('[MONITOR ALERT WARNING]');
      expect(combined).toContain('Failed to deliver webhook alert');
    });

    it('MUST enforce deadline on getObject open phase and cancel/destroy real Node.js Readable stream without unhandled errors', async () => {
      const script = `
        import { Readable } from 'stream';
        import { openS3ObjectWithDeadline } from '${monitorScriptUrl}';

        let unhandledErrors = [];
        process.on('uncaughtException', (err) => {
          unhandledErrors.push('uncaughtException: ' + err.message);
        });
        process.on('unhandledRejection', (reason) => {
          unhandledErrors.push('unhandledRejection: ' + (reason ? reason.message || reason : 'unknown'));
        });

        // Create a REAL Node.js Readable stream
        const realLateStream = new Readable({
          read() {
            // No-op read implementation
          }
        });

        let realStreamClosed = false;
        realLateStream.on('close', () => {
          realStreamClosed = true;
        });

        let lateResolve;
        const hangingOpenPromise = new Promise((resolve) => {
          lateResolve = resolve;
        });

        const mockClient = {
          getObject: () => hangingOpenPromise,
        };

        let caughtTimeout = false;
        try {
          await openS3ObjectWithDeadline(mockClient, 'bucket', 'test.dump', {
            openTimeoutMs: 100,
          });
        } catch (err) {
          caughtTimeout = err.code === 'GET_OBJECT_TIMEOUT';
        }

        // Now resolve the hanging promise with the REAL Readable stream late after timeout has expired
        lateResolve(realLateStream);
        await new Promise((r) => setTimeout(r, 50));

        console.log('OPEN_TIMEOUT_CAUGHT:' + caughtTimeout);
        console.log('REAL_STREAM_DESTROYED:' + realLateStream.destroyed);
        console.log('REAL_STREAM_CLOSED:' + realStreamClosed);
        console.log('UNHANDLED_ERROR_COUNT:' + unhandledErrors.length);
        if (unhandledErrors.length > 0) {
          console.error('UNHANDLED_ERRORS:' + JSON.stringify(unhandledErrors));
        }
      `;

      const { stdout, stderr } = await execFileAsync('node', ['--input-type=module', '-e', script]);
      expect(stdout).toContain('OPEN_TIMEOUT_CAUGHT:true');
      expect(stdout).toContain('REAL_STREAM_DESTROYED:true');
      expect(stdout).toContain('REAL_STREAM_CLOSED:true');
      expect(stdout).toContain('UNHANDLED_ERROR_COUNT:0');
      expect(stderr).toBe('');
    });

    it('MUST detect never-resolving getObject() and report CRITICAL with exit code 1 within finite deadline', async () => {
      const script = `
        import { EventEmitter } from 'events';
        import { monitorS3Backups } from '${monitorScriptUrl}';

        const mockObjects = [
          { name: 'hourly/ocop_backup_hourly_2026-11-19T10-00-00-000Z.dump', size: 1024, lastModified: new Date() },
          { name: 'hourly/ocop_backup_hourly_2026-11-19T10-00-00-000Z.dump.sha256', size: 120, lastModified: new Date() },
          { name: 'hourly/ocop_backup_hourly_2026-11-19T10-00-00-000Z.dump.sha256.sig', size: 64, lastModified: new Date() },
        ];

        // getObject hangs indefinitely (never resolves)
        const mockS3Client = {
          bucketExists: async () => true,
          listObjectsV2: () => {
            const ee = new EventEmitter();
            process.nextTick(() => {
              for (const obj of mockObjects) ee.emit('data', obj);
              ee.emit('end');
            });
            return ee;
          },
          getObject: () => new Promise(() => {}) // Never resolves!
        };

        await monitorS3Backups({
          isDirect: true, // MUST trigger process.exit(1) on CRITICAL status
          s3Client: mockS3Client,
          s3Bucket: 'test-bucket',
          tier: 'hourly',
          getObjectTimeoutMs: 250, // Finite open deadline: 250ms
        });
      `;

      const t0 = Date.now();
      let childExitCode = null;
      let childStdout = '';
      let childStderr = '';

      try {
        const res = await execFileAsync('node', ['--input-type=module', '-e', script]);
        childStdout = res.stdout;
        childStderr = res.stderr;
        childExitCode = 0;
      } catch (err) {
        childExitCode = err.code !== undefined ? err.code : 1;
        childStdout = err.stdout || '';
        childStderr = err.stderr || '';
      }
      const durationMs = Date.now() - t0;

      // 1. Process MUST exit with code 1
      expect(childExitCode).toBe(1);

      // 2. Must complete within finite duration (< 4000ms), proving it did NOT hang
      expect(durationMs).toBeLessThan(4000);

      // 3. Output must indicate CRITICAL status and S3_GET_OBJECT_TIMEOUT issue
      expect(childStdout).toContain('MONITOR SUMMARY: CRITICAL');
      expect(childStdout).toContain('S3_GET_OBJECT_TIMEOUT');
      expect(childStdout).toContain('S3 getObject open operation timed out after 250ms');
    });
  });

  describe('S3 Object Lock / WORM Immutability Compatibility Probes', () => {
    const wormScratchDir = path.resolve(__dirname, '../.worm-scratch-' + Date.now());

    beforeAll(() => {
      if (fs.existsSync(wormScratchDir)) {
        fs.rmSync(wormScratchDir, { recursive: true, force: true });
      }
      fs.mkdirSync(wormScratchDir, { recursive: true });
    });

    afterAll(() => {
      if (fs.existsSync(wormScratchDir)) {
        fs.rmSync(wormScratchDir, { recursive: true, force: true });
      }
    });

    it('MUST delegate S3 retention pruning to Lifecycle Rules when BACKUP_S3_USE_LIFECYCLE_PRUNING is active', async () => {
      const scriptUrl = pathToFileURL(backupScriptPath).href;
      const script = `
        import { runProductionBackup } from '${scriptUrl}';

        const res = await runProductionBackup({
          isDirect: false,
          tier: 'hourly',
          useLifecyclePruning: true,
          storageType: 'dual',
          s3Bucket: 'ocop-test-worm-bucket',
          s3Endpoint: 'localhost',
          s3Port: 9000,
          s3UseSSL: false,
          s3AccessKey: 'minioadmin',
          s3SecretKey: 'minioadmin',
          localDir: '${wormScratchDir.replace(/\\/g, '/')}',
          dbUrl: 'postgresql://postgres:postgres@localhost:5432/ocop_test',
        });

        console.log('BACKUP_SUCCESS:' + res.success);
      `;

      const { stdout } = await execFileAsync('node', ['--input-type=module', '-e', script]);
      expect(stdout).toContain('BACKUP_SUCCESS:true');
      expect(stdout).toContain('S3 retention pruning delegated to S3 Bucket Lifecycle / WORM Rules');
    });

    it('MUST handle S3 Object Lock / WORM AccessDenied errors gracefully without failing backup job', async () => {
      const scriptUrl = pathToFileURL(backupScriptPath).href;
      const script = `
        import { runProductionBackup } from '${scriptUrl}';
        import { Client as MinioClient } from 'minio';

        // Monkey-patch MinioClient.prototype.removeObject to simulate S3 WORM Object Under Retention error
        const originalRemoveObject = MinioClient.prototype.removeObject;
        MinioClient.prototype.removeObject = async function(bucket, key) {
          const err = new Error('AccessDenied: Object under retention (WORM Compliance Lock active)');
          err.code = 'ObjectUnderRetention';
          throw err;
        };

        // Seed an old object on S3 bucket to trigger removal attempt
        const s3 = new MinioClient({
          endPoint: 'localhost',
          port: 9000,
          useSSL: false,
          accessKey: 'minioadmin',
          secretKey: 'minioadmin',
        });
        const testBucket = 'ocop-test-worm-graceful';
        if (!await s3.bucketExists(testBucket)) {
          await s3.makeBucket(testBucket);
        }
        await s3.putObject(testBucket, 'hourly/ocop_backup_hourly_2020-01-01T00-00-00-000Z.dump', Buffer.from('old dump'));
        await new Promise((r) => setTimeout(r, 200));

        try {
          const res = await runProductionBackup({
            isDirect: false,
            tier: 'hourly',
            maxAgeMs: 50,
            useLifecyclePruning: false,
            storageType: 'dual',
            s3Bucket: testBucket,
            s3Endpoint: 'localhost',
            s3Port: 9000,
            s3UseSSL: false,
            s3AccessKey: 'minioadmin',
            s3SecretKey: 'minioadmin',
            localDir: '${wormScratchDir.replace(/\\/g, '/')}',
            dbUrl: 'postgresql://postgres:postgres@localhost:5432/ocop_test',
          });

          console.log('GRACEFUL_SUCCESS:' + res.success);
        } finally {
          MinioClient.prototype.removeObject = originalRemoveObject;
          try {
            await s3.removeObject(testBucket, 'hourly/ocop_backup_hourly_2020-01-01T00-00-00-000Z.dump');
            // Clean other objects
            const stream = s3.listObjectsV2(testBucket, '', true);
            stream.on('data', async (obj) => {
              if (obj.name) await s3.removeObject(testBucket, obj.name).catch(() => {});
            });
            await new Promise((r) => setTimeout(r, 400));
            await s3.removeBucket(testBucket).catch(() => {});
          } catch {}
        }
      `;

      const { stdout, stderr } = await execFileAsync('node', ['--input-type=module', '-e', script]);
      expect(stdout).toContain('GRACEFUL_SUCCESS:true');
      const combined = stdout + stderr;
      expect(combined).toContain('[WORM/OBJECT-LOCK RETENTION]');
      expect(combined).toContain('is protected by Object Lock/WORM immutability policy');
    });

    it('MUST fail backup job with [S3 RETENTION CRITICAL ERROR] when manual pruning encounters real IAM permission error', async () => {
      const scriptUrl = pathToFileURL(backupScriptPath).href;
      const script = `
        import { runProductionBackup } from '${scriptUrl}';
        import { Client as MinioClient } from 'minio';

        // Monkey-patch MinioClient.prototype.removeObject to simulate generic IAM AccessDenied (not WORM retention)
        const originalRemoveObject = MinioClient.prototype.removeObject;
        MinioClient.prototype.removeObject = async function(bucket, key) {
          const err = new Error('AccessDenied: User is not authorized to perform: s3:DeleteObject on resource');
          err.code = 'AccessDenied';
          throw err;
        };

        const s3 = new MinioClient({
          endPoint: 'localhost',
          port: 9000,
          useSSL: false,
          accessKey: 'minioadmin',
          secretKey: 'minioadmin',
        });
        const testBucket = 'ocop-test-iam-fail';
        if (!await s3.bucketExists(testBucket)) {
          await s3.makeBucket(testBucket);
        }
        await s3.putObject(testBucket, 'hourly/ocop_backup_hourly_2020-01-01T00-00-00-000Z.dump', Buffer.from('old dump'));
        await new Promise((r) => setTimeout(r, 200));

        let failed = false;
        try {
          await runProductionBackup({
            isDirect: false,
            tier: 'hourly',
            maxAgeMs: 50,
            useLifecyclePruning: false,
            storageType: 'dual',
            s3Bucket: testBucket,
            s3Endpoint: 'localhost',
            s3Port: 9000,
            s3UseSSL: false,
            s3AccessKey: 'minioadmin',
            s3SecretKey: 'minioadmin',
            localDir: '${wormScratchDir.replace(/\\/g, '/')}',
            dbUrl: 'postgresql://postgres:postgres@localhost:5432/ocop_test',
          });
        } catch (err) {
          failed = true;
          console.log('IAM_ERROR_MESSAGE:' + err.message);
        } finally {
          MinioClient.prototype.removeObject = originalRemoveObject;
          try {
            await s3.removeObject(testBucket, 'hourly/ocop_backup_hourly_2020-01-01T00-00-00-000Z.dump');
            const stream = s3.listObjectsV2(testBucket, '', true);
            stream.on('data', async (obj) => {
              if (obj.name) await s3.removeObject(testBucket, obj.name).catch(() => {});
            });
            await new Promise((r) => setTimeout(r, 400));
            await s3.removeBucket(testBucket).catch(() => {});
          } catch {}
        }
        console.log('JOB_FAILED:' + failed);
      `;

      const { stdout } = await execFileAsync('node', ['--input-type=module', '-e', script]);
      expect(stdout).toContain('JOB_FAILED:true');
      expect(stdout).toContain('[S3 RETENTION CRITICAL ERROR]');
      expect(stdout).toContain('due to IAM permission or network error (not Object Lock)');
    });
  });
});
