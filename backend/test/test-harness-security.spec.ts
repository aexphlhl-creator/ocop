import {
  validateSessionId,
  validateContainerId,
  buildDisposableDbName,
  buildRedisContainerName,
  verifyTeardownPlan,
  SESSION_ID_REGEX,
} from './helpers/e2e-safety';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { writeFileSync, existsSync, unlinkSync } from 'fs';
import { Client } from 'pg';
import globalTeardown from './global-teardown-e2e';

const execFileAsync = promisify(execFile);

describe('E2E Test Harness Security & Safety Probes', () => {
  describe('Session ID Shell Injection & Validation Defense', () => {
    it('accepts clean, valid alphanumeric, dash, and underscore session IDs', () => {
      const validCases = [
        'sess_123_abc',
        'e2e-session-valid-01',
        'run_20261119_pid9999',
        'Job-Alpha_01',
        'a',
        '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-',
      ];

      for (const validId of validCases) {
        expect(validateSessionId(validId)).toBe(validId);
        expect(buildDisposableDbName(validId)).toBe(`ocop_e2e_disp_${validId}`);
        expect(buildRedisContainerName(validId)).toBe(`ocop_redis_disp_${validId}`);
      }
    });

    it('rejects session IDs containing shell metacharacters and command injection payloads', () => {
      const injectionPayloads = [
        'sess;rm -rf /',
        'sess|whoami',
        'sess&touch /tmp/pwned',
        'sess$(cat /etc/passwd)',
        'sess`id`',
        'sess > out.txt',
        'sess < in.txt',
        'sess || echo evil',
        'sess && echo evil',
        'sess "quoted"',
        "sess 'singlequoted'",
        'sess with spaces',
        'sess\nnewline',
        'sess\rreturn',
        'sess\0nullbyte',
        'sess;docker stop $(docker ps -q)',
        'sess$(reboot)',
        '..',
        '../../etc/passwd',
      ];

      for (const payload of injectionPayloads) {
        expect(() => validateSessionId(payload)).toThrow(
          /Invalid session ID[\s\S]*must not contain shell metacharacters/i,
        );
      }
    });

    it('rejects empty strings, non-string types, and oversized session IDs (> 64 chars)', () => {
      expect(() => validateSessionId('')).toThrow(
        /Session ID must be a non-empty string/,
      );
      expect(() => validateSessionId(null as any)).toThrow(
        /Session ID must be a non-empty string/,
      );
      expect(() => validateSessionId(undefined as any)).toThrow(
        /Session ID must be a non-empty string/,
      );

      const oversized = 'a'.repeat(65);
      expect(() => validateSessionId(oversized)).toThrow(
        /Invalid session ID.*must match/i,
      );
    });

    it('validates hexadecimal container IDs strictly', () => {
      expect(validateContainerId('42baf1031bcd')).toBe('42baf1031bcd');
      expect(
        validateContainerId(
          '42baf1031bcd5565a7119bf5df7a86413be400a9c93c6bbbb393b38a165e47e2',
        ),
      ).toBe('42baf1031bcd5565a7119bf5df7a86413be400a9c93c6bbbb393b38a165e47e2');

      const invalidContainerIds = [
        '42baf1031bcg', // non-hex 'g'
        '42baf; rm -rf', // shell injection
        'short', // < 12 chars
        '$(whoami)',
        '',
      ];

      for (const id of invalidContainerIds) {
        expect(() => validateContainerId(id)).toThrow(
          /Container ID must be a non-empty string|Invalid container ID/i,
        );
      }
    });
  });

  describe('check-residuals.mjs Audit Failure Defenses', () => {
    const scriptPath = join(__dirname, '..', 'scripts', 'check-residuals.mjs');

    it('returns non-zero exit code (1) and logs error when Docker audit fails', async () => {
      // Simulate Docker daemon failure by pointing DOCKER_HOST to an unreachable endpoint
      let exitCode: number | null = null;
      let stdout = '';
      let stderr = '';

      try {
        const result = await execFileAsync('node', [scriptPath], {
          env: {
            ...process.env,
            DOCKER_HOST: 'tcp://127.0.0.1:59999', // Non-existent Docker daemon
          },
        });
        stdout = result.stdout;
        stderr = result.stderr;
        exitCode = 0;
      } catch (err: any) {
        exitCode = err.code ?? 1;
        stdout = err.stdout ?? '';
        stderr = err.stderr ?? '';
      }

      expect(exitCode).toBe(1);
      const output = stdout + stderr;
      expect(output).toMatch(/\[DOCKER AUDIT ERROR\]/);
      expect(output).toMatch(/\[CHECK-RESIDUALS\] FAILED/);
    });

    it('returns non-zero exit code (1) and logs error when PostgreSQL audit fails', async () => {
      let exitCode: number | null = null;
      let stdout = '';
      let stderr = '';

      try {
        const result = await execFileAsync('node', [scriptPath], {
          env: {
            ...process.env,
            TEST_DATABASE_URL:
              'postgresql://invalid_user:invalid_pwd@127.0.0.1:59999/postgres?sslmode=disable&connect_timeout=1',
          },
        });
        stdout = result.stdout;
        stderr = result.stderr;
        exitCode = 0;
      } catch (err: any) {
        exitCode = err.code ?? 1;
        stdout = err.stdout ?? '';
        stderr = err.stderr ?? '';
      }

      expect(exitCode).toBe(1);
      const output = stdout + stderr;
      expect(output).toMatch(/\[POSTGRES AUDIT ERROR\]/);
      expect(output).toMatch(/\[CHECK-RESIDUALS\] FAILED/);
    });

    it('returns non-zero exit code (1) and logs error when Redis audit fails', async () => {
      let exitCode: number | null = null;
      let stdout = '';
      let stderr = '';

      try {
        const result = await execFileAsync('node', [scriptPath], {
          env: {
            ...process.env,
            REDIS_PORT: '59999', // Unreachable Redis port
          },
        });
        stdout = result.stdout;
        stderr = result.stderr;
        exitCode = 0;
      } catch (err: any) {
        exitCode = err.code ?? 1;
        stdout = err.stdout ?? '';
        stderr = err.stderr ?? '';
      }

      expect(exitCode).toBe(1);
      const output = stdout + stderr;
      expect(output).toMatch(/\[REDIS AUDIT ERROR\]/);
      expect(output).toMatch(/\[CHECK-RESIDUALS\] FAILED/);
    });
  });

  describe('Teardown Metadata Integrity & Negative DROP DATABASE Defense', () => {
    const adminUrl =
      process.env.TEST_DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable';

    it('rejects when metadata.disposableDbName does not match deterministic expectation', () => {
      const sessionId = 'sess_valid_123';
      const validPlan = verifyTeardownPlan({
        envSessionId: sessionId,
        testDatabaseUrl: adminUrl,
        metadata: {
          sessionId,
          disposableDbName: buildDisposableDbName(sessionId),
          redisContainerName: buildRedisContainerName(sessionId),
          redisContainerId: 'a1b2c3d4e5f67890',
        },
      });

      expect(validPlan.sessionId).toBe(sessionId);
      expect(validPlan.expectedDbName).toBe(`ocop_e2e_disp_${sessionId}`);
      expect(validPlan.expectedContainerName).toBe(`ocop_redis_disp_${sessionId}`);
      expect(validPlan.targetContainerId).toBe('a1b2c3d4e5f67890');

      expect(() =>
        verifyTeardownPlan({
          envSessionId: sessionId,
          testDatabaseUrl: adminUrl,
          metadata: {
            sessionId,
            disposableDbName: 'postgres', // Attack payload: attempted drop of system DB
            redisContainerName: buildRedisContainerName(sessionId),
            redisContainerId: 'a1b2c3d4e5f67890',
          },
        }),
      ).toThrow(
        /Tampered metadata detected! metadata\.disposableDbName 'postgres' does not match expected deterministic name/i,
      );

      expect(() =>
        verifyTeardownPlan({
          envSessionId: sessionId,
          testDatabaseUrl: adminUrl,
          metadata: {
            sessionId,
            disposableDbName: 'ocop_production', // Attack payload: attempted drop of production DB
            redisContainerName: buildRedisContainerName(sessionId),
            redisContainerId: 'a1b2c3d4e5f67890',
          },
        }),
      ).toThrow(/Tampered metadata detected! metadata\.disposableDbName/i);
    });

    it('rejects when metadata.redisContainerName does not match deterministic expectation', () => {
      const sessionId = 'sess_valid_456';
      expect(() =>
        verifyTeardownPlan({
          envSessionId: sessionId,
          testDatabaseUrl: adminUrl,
          metadata: {
            sessionId,
            disposableDbName: buildDisposableDbName(sessionId),
            redisContainerName: 'ocop_redis_production', // Tampered container
            redisContainerId: 'a1b2c3d4e5f67890',
          },
        }),
      ).toThrow(
        /Tampered metadata detected! metadata\.redisContainerName 'ocop_redis_production' does not match/i,
      );
    });

    it('rejects when metadata is missing mandatory fields (disposableDbName, redisContainerName, sessionId, redisContainerId)', () => {
      const sessionId = 'sess_valid_incomplete';
      // Missing disposableDbName
      expect(() =>
        verifyTeardownPlan({
          envSessionId: sessionId,
          testDatabaseUrl: adminUrl,
          metadata: {
            sessionId,
            redisContainerName: buildRedisContainerName(sessionId),
            redisContainerId: 'a1b2c3d4e5f67890',
          },
        }),
      ).toThrow(
        /Incomplete metadata: disposableDbName is required and must match expected deterministic name/i,
      );

      // Missing redisContainerName
      expect(() =>
        verifyTeardownPlan({
          envSessionId: sessionId,
          testDatabaseUrl: adminUrl,
          metadata: {
            sessionId,
            disposableDbName: buildDisposableDbName(sessionId),
            redisContainerId: 'a1b2c3d4e5f67890',
          },
        }),
      ).toThrow(
        /Incomplete metadata: redisContainerName is required and must match expected deterministic name/i,
      );

      // Missing sessionId
      expect(() =>
        verifyTeardownPlan({
          envSessionId: sessionId,
          testDatabaseUrl: adminUrl,
          metadata: {
            disposableDbName: buildDisposableDbName(sessionId),
            redisContainerName: buildRedisContainerName(sessionId),
            redisContainerId: 'a1b2c3d4e5f67890',
          },
        }),
      ).toThrow(
        /Incomplete metadata: sessionId is required/i,
      );

      // Missing redisContainerId
      expect(() =>
        verifyTeardownPlan({
          envSessionId: sessionId,
          testDatabaseUrl: adminUrl,
          metadata: {
            sessionId,
            disposableDbName: buildDisposableDbName(sessionId),
            redisContainerName: buildRedisContainerName(sessionId),
          },
        }),
      ).toThrow(
        /Incomplete metadata: redisContainerId is required and must be a 12-64 char hexadecimal string/i,
      );

      // Invalid redisContainerId format (non-hex or too short)
      expect(() =>
        verifyTeardownPlan({
          envSessionId: sessionId,
          testDatabaseUrl: adminUrl,
          metadata: {
            sessionId,
            disposableDbName: buildDisposableDbName(sessionId),
            redisContainerName: buildRedisContainerName(sessionId),
            redisContainerId: 'invalid-non-hex-id',
          },
        }),
      ).toThrow(/Invalid container ID/i);
    });

    it('rejects when TEST_DATABASE_URL is missing or session ID mismatches', () => {
      expect(() =>
        verifyTeardownPlan({
          envSessionId: 'sess_1',
          testDatabaseUrl: '',
          metadata: {
            sessionId: 'sess_1',
            disposableDbName: buildDisposableDbName('sess_1'),
            redisContainerName: buildRedisContainerName('sess_1'),
            redisContainerId: 'a1b2c3d4e5f67890',
          },
        }),
      ).toThrow(/TEST_DATABASE_URL must be explicitly declared/i);

      expect(() =>
        verifyTeardownPlan({
          envSessionId: 'sess_env_1',
          testDatabaseUrl: adminUrl,
          metadata: {
            sessionId: 'sess_file_2',
            disposableDbName: buildDisposableDbName('sess_env_1'),
            redisContainerName: buildRedisContainerName('sess_env_1'),
            redisContainerId: 'a1b2c3d4e5f67890',
          },
        }),
      ).toThrow(/Session ID mismatch/i);
    });

    it('refuses teardown and preserves metadata when simulated teardown failure occurs', async () => {
      const simSessionId = `sess_simfail_${Date.now()}`;
      const simDbName = buildDisposableDbName(simSessionId);
      const sessionFile = join(__dirname, `.e2e-session-${simSessionId}.json`);

      const sessionData = {
        sessionId: simSessionId,
        disposableDbName: simDbName,
        redisContainerName: buildRedisContainerName(simSessionId),
        redisContainerId: 'a1b2c3d4e5f67890',
        createdAt: new Date().toISOString(),
      };
      writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2));

      process.env.E2E_SESSION_ID = simSessionId;
      process.env.TEST_DATABASE_URL = adminUrl;
      process.env.SIMULATE_TEARDOWN_FAILURE = 'true';

      try {
        await expect(globalTeardown()).rejects.toThrow(
          /Simulated teardown failure/i,
        );
        // Verify metadata file was preserved because teardown failed
        expect(existsSync(sessionFile)).toBe(true);
      } finally {
        delete process.env.SIMULATE_TEARDOWN_FAILURE;
        delete process.env.E2E_SESSION_ID;
        if (existsSync(sessionFile)) {
          unlinkSync(sessionFile);
        }
      }
    });

    it('refuses teardown and explicitly reports residual database when database drop fails', async () => {
      const simSessionId = `sess_dbfail_${Date.now()}`;
      const simDbName = buildDisposableDbName(simSessionId);
      const sessionFile = join(__dirname, `.e2e-session-${simSessionId}.json`);

      const sessionData = {
        sessionId: simSessionId,
        disposableDbName: simDbName,
        redisContainerName: buildRedisContainerName(simSessionId),
        redisContainerId: 'a1b2c3d4e5f67890',
        createdAt: new Date().toISOString(),
      };
      writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2));

      process.env.E2E_SESSION_ID = simSessionId;
      process.env.TEST_DATABASE_URL = adminUrl;
      process.env.SIMULATE_DB_DROP_FAILURE = 'true';

      try {
        await expect(globalTeardown()).rejects.toThrow(
          /Uncleaned resources.*PostgreSQL Database/i,
        );
        // Verify metadata file was preserved because teardown failed
        expect(existsSync(sessionFile)).toBe(true);
      } finally {
        delete process.env.SIMULATE_DB_DROP_FAILURE;
        delete process.env.E2E_SESSION_ID;
        if (existsSync(sessionFile)) {
          unlinkSync(sessionFile);
        }
      }
    });

    it('refuses teardown and explicitly reports residual metadata file when metadata unlink fails', async () => {
      const simSessionId = `sess_unlinkfail_${Date.now()}`;
      const simDbName = buildDisposableDbName(simSessionId);
      const sessionFile = join(__dirname, `.e2e-session-${simSessionId}.json`);

      const sessionData = {
        sessionId: simSessionId,
        disposableDbName: simDbName,
        redisContainerName: buildRedisContainerName(simSessionId),
        redisContainerId: 'a1b2c3d4e5f67890',
        createdAt: new Date().toISOString(),
      };
      writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2));

      process.env.E2E_SESSION_ID = simSessionId;
      process.env.TEST_DATABASE_URL = adminUrl;
      process.env.SIMULATE_METADATA_UNLINK_FAILURE = 'true';

      try {
        await expect(globalTeardown()).rejects.toThrow(
          /Uncleaned resource.*Metadata File/i,
        );
        // Verify metadata file was preserved
        expect(existsSync(sessionFile)).toBe(true);
      } finally {
        delete process.env.SIMULATE_METADATA_UNLINK_FAILURE;
        delete process.env.E2E_SESSION_ID;
        if (existsSync(sessionFile)) {
          unlinkSync(sessionFile);
        }
      }
    });

    it('NEGATIVE TEST: Tampered session metadata pointing to another database CANNOT drop that database', async () => {
      const attackSessionId = `sess_attack_${Date.now()}`;
      const protectedDbName = `ocop_test_protected_target_${Date.now()}`;
      const sessionFile = join(__dirname, `.e2e-session-${attackSessionId}.json`);

      // Step 1: Provision the protected database that must NOT be dropped
      const urlObj = new URL(adminUrl);
      urlObj.pathname = '/postgres';
      const pgClient = new Client({ connectionString: urlObj.toString() });
      await pgClient.connect();
      await pgClient.query(`CREATE DATABASE ${protectedDbName};`);

      try {
        // Step 2: Create a tampered metadata file pointing disposableDbName to protectedDbName
        const tamperedMetadata = {
          sessionId: attackSessionId,
          disposableDbName: protectedDbName, // Maliciously forged database name
          redisContainerName: buildRedisContainerName(attackSessionId),
          redisContainerId: 'a1b2c3d4e5f67890',
          createdAt: new Date().toISOString(),
        };
        writeFileSync(sessionFile, JSON.stringify(tamperedMetadata, null, 2));

        // Step 3: Run globalTeardown under attackSessionId
        process.env.E2E_SESSION_ID = attackSessionId;
        process.env.TEST_DATABASE_URL = adminUrl;

        let teardownError: any = null;
        try {
          await globalTeardown();
        } catch (err: any) {
          teardownError = err;
        }

        // Step 4: Verify globalTeardown threw a security error and refused to drop
        expect(teardownError).not.toBeNull();
        expect(teardownError.message).toMatch(
          /Tampered metadata detected! metadata\.disposableDbName/i,
        );

        // Step 5: Verify the protected database STILL EXISTS in PostgreSQL!
        const checkDbResult = await pgClient.query(
          `SELECT datname FROM pg_database WHERE datname = $1;`,
          [protectedDbName],
        );
        expect(checkDbResult.rows.length).toBe(1);
        expect(checkDbResult.rows[0].datname).toBe(protectedDbName);

        // Step 6: Verify the metadata file was preserved for forensic analysis
        expect(existsSync(sessionFile)).toBe(true);
      } finally {
        // Cleanup test fixtures without resetting global process.exitCode
        await pgClient.query(
          `DROP DATABASE IF EXISTS ${protectedDbName} WITH (FORCE);`,
        );
        await pgClient.end();
        if (existsSync(sessionFile)) {
          unlinkSync(sessionFile);
        }
        delete process.env.E2E_SESSION_ID;
      }
    });
  });
});
