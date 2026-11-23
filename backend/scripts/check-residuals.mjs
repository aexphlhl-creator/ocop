import { Client } from 'pg';
import Redis from 'ioredis';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  console.log('[CHECK-RESIDUALS] Starting strictly read-only audit of test resources...');
  let hasResiduals = false;
  let hasAuditErrors = false;

  // 1. Audit PostgreSQL for disposable databases (READ ONLY)
  const pgAdminUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable';
  const urlObj = new URL(pgAdminUrl);
  urlObj.pathname = '/postgres';

  const pg = new Client({ connectionString: urlObj.toString() });
  try {
    await pg.connect();
    const dbs = await pg.query(
      "SELECT datname FROM pg_database WHERE datname LIKE 'ocop_e2e_disp_%' ORDER BY datname",
    );
    console.log(
      `[POSTGRES] Residual disposable databases: ${dbs.rows.length}`,
    );
    if (dbs.rows.length > 0) {
      hasResiduals = true;
      for (const row of dbs.rows) {
        console.log(`  - Database: ${row.datname}`);
      }
    }
  } catch (err) {
    console.error(`[POSTGRES AUDIT ERROR] Failed to query PostgreSQL databases: ${err.message}`);
    hasAuditErrors = true;
  } finally {
    await pg.end().catch(() => {});
  }

  // 2. Audit Redis across dedicated test databases (DB 1 - 15) (READ ONLY)
  const redisHost = process.env.REDIS_HOST || '127.0.0.1';
  const redisPort = Number(process.env.REDIS_PORT || 6379);
  let totalRedisKeys = 0;

  // Verify Redis connectivity first
  const pingRedis = new Redis({
    host: redisHost,
    port: redisPort,
    lazyConnect: true,
    connectTimeout: 2000,
  });
  try {
    await pingRedis.connect();
    const pong = await pingRedis.ping();
    if (pong !== 'PONG') {
      throw new Error(`Unexpected PING response from Redis: ${pong}`);
    }
    await pingRedis.quit();

    for (let dbIndex = 1; dbIndex <= 15; dbIndex++) {
      const redis = new Redis({
        host: redisHost,
        port: redisPort,
        db: dbIndex,
        lazyConnect: true,
        connectTimeout: 2000,
      });
      try {
        await redis.connect();
        const keys = await redis.keys('*');
        if (keys.length > 0) {
          console.log(
            `[REDIS] DB ${dbIndex} has ${keys.length} residual key(s): ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`,
          );
          totalRedisKeys += keys.length;
          hasResiduals = true;
        }
      } catch (err) {
        console.error(`[REDIS AUDIT ERROR] Failed to inspect Redis DB ${dbIndex}: ${err.message}`);
        hasAuditErrors = true;
      } finally {
        await redis.quit().catch(() => {});
      }
    }

    if (totalRedisKeys === 0 && !hasAuditErrors) {
      console.log('[REDIS] Residual keys across test DBs (1-15): 0');
    }
  } catch (err) {
    console.error(`[REDIS AUDIT ERROR] Failed to connect/audit Redis at ${redisHost}:${redisPort}: ${err.message}`);
    hasAuditErrors = true;
  } finally {
    await pingRedis.quit().catch(() => {});
  }

  // 3. Audit Docker for disposable Redis containers (READ ONLY, NO SHELL INTERPOLATION)
  try {
    const containerOutput = execFileSync(
      'docker',
      ['ps', '-a', '--filter', 'label=created-by=ocop-e2e-test', '--format', '{{.Names}}'],
      { encoding: 'utf8' },
    ).trim();

    if (containerOutput) {
      const containerNames = containerOutput.split(/\r?\n/).filter(Boolean);
      if (containerNames.length > 0) {
        console.log(
          `[DOCKER] Residual disposable Redis containers: ${containerNames.length}`,
        );
        for (const name of containerNames) {
          console.log(`  - Container: ${name}`);
        }
        hasResiduals = true;
      } else {
        console.log('[DOCKER] Residual disposable Redis containers: 0');
      }
    } else {
      console.log('[DOCKER] Residual disposable Redis containers: 0');
    }
  } catch (err) {
    console.error(`[DOCKER AUDIT ERROR] Failed to query Docker containers: ${err.message}`);
    hasAuditErrors = true;
  }

  // 4. Audit test directory for leftover session metadata files (READ ONLY)
  try {
    const testDir = join(__dirname, '..', 'test');
    const testFiles = readdirSync(testDir);
    const sessionFiles = testFiles.filter(
      (f) =>
        f.startsWith('.e2e-session-') || f.startsWith('.e2e-disposable-session'),
    );

    console.log(`[FILES] Leftover session metadata files: ${sessionFiles.length}`);
    if (sessionFiles.length > 0) {
      hasResiduals = true;
      for (const f of sessionFiles) {
        console.log(`  - File: ${f}`);
      }
    }
  } catch (err) {
    console.error(`[FILES AUDIT ERROR] Failed to inspect test directory: ${err.message}`);
    hasAuditErrors = true;
  }

  // 5. Output final audit verdict
  console.log('---');
  if (hasAuditErrors) {
    console.error(
      '[CHECK-RESIDUALS] FAILED: Audit probe failed to verify one or more required test services (PostgreSQL/Redis/Docker)!',
    );
    process.exit(1);
  }
  if (hasResiduals) {
    console.error(
      '[CHECK-RESIDUALS] FAILED: Residual test resources were detected!',
    );
    process.exit(1);
  }
  console.log(
    '[CHECK-RESIDUALS] PASSED: Clean state. Exactly 0 residual databases, 0 keys, and 0 session files.',
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('[CHECK-RESIDUALS] Fatal error during audit execution:', err);
  process.exit(1);
});
