import { Client } from 'pg';
import Redis from 'ioredis';
import { execFileSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';
import {
  validateSessionId,
  validateContainerId,
  buildDisposableDbName,
  buildRedisContainerName,
} from './helpers/e2e-safety';

export default async function globalSetup() {
  console.log(
    '\n[E2E DISPOSABLE SETUP] Initializing isolated disposable environment...',
  );

  // 1. Determine base PostgreSQL connection from TEST_DATABASE_URL only (strictly NO fallback to application DATABASE_URL)
  const envUrl = process.env.TEST_DATABASE_URL;
  if (!envUrl || !envUrl.trim()) {
    throw new Error(
      '[E2E SAFETY GUARD] Execution aborted: TEST_DATABASE_URL must be explicitly declared for E2E tests. ' +
        'Implicit fallback to DATABASE_URL or development/production database is strictly prohibited.',
    );
  }

  const rawSessionId =
    process.env.E2E_SESSION_ID ||
    `sess_${Date.now()}_${process.pid}_${Math.floor(Math.random() * 10000)}`;
  const sessionId = validateSessionId(rawSessionId);
  process.env.E2E_SESSION_ID = sessionId;

  const urlObj = new URL(envUrl);
  const baseDb = 'postgres';
  const adminUrl = `${urlObj.protocol}//${urlObj.username}:${urlObj.password}@${urlObj.host}/${baseDb}${urlObj.search}`;

  const disposableDbName = buildDisposableDbName(sessionId);
  const disposableDbUrl = `${urlObj.protocol}//${urlObj.username}:${urlObj.password}@${urlObj.host}/${disposableDbName}${urlObj.search}`;
  const redisContainerName = buildRedisContainerName(sessionId);

  let disposableDbCreated = false;
  let redisContainerCreated = false;
  let validatedContainerId = '';
  let redisPort = 6379;
  const specificSessionPath = join(__dirname, `.e2e-session-${sessionId}.json`);

  try {
    // 2. Connect to postgres administrative database and create ONLY this session's database.
    // CRITICAL: NEVER query or drop other databases of concurrently running E2E processes!
    const pgClient = new Client({ connectionString: adminUrl });
    pgClient.on('error', () => {});
    await pgClient.connect();
    await pgClient.query(`CREATE DATABASE ${disposableDbName};`);
    await pgClient.end();
    disposableDbCreated = true;
    console.log(
      `[E2E DISPOSABLE SETUP] Created disposable PostgreSQL database: ${disposableDbName}`,
    );

    // 3. Start dedicated ephemeral Redis Docker container strictly published on 127.0.0.1
    // CRITICAL: Use execFileSync with separate arguments array (NO shell interpolation)
    console.log(
      `[E2E DISPOSABLE SETUP] Spawning dedicated Redis container: ${redisContainerName}...`,
    );
    const rawContainerId = execFileSync(
      'docker',
      [
        'run',
        '-d',
        '--name',
        redisContainerName,
        '--label',
        `e2e-session-id=${sessionId}`,
        '--label',
        'created-by=ocop-e2e-test',
        '-p',
        '127.0.0.1:0:6379',
        'redis:7-alpine',
      ],
      { encoding: 'utf8' },
    ).trim();
    validatedContainerId = validateContainerId(rawContainerId);
    redisContainerCreated = true;

    // Inspect container to verify localhost-only binding and discover the dynamically mapped host port
    const inspectJson = execFileSync(
      'docker',
      ['inspect', validatedContainerId],
      { encoding: 'utf8' },
    );
    const inspectData = JSON.parse(inspectJson);
    const portBindings =
      inspectData[0]?.NetworkSettings?.Ports?.['6379/tcp'] || [];
    if (portBindings.length === 0) {
      throw new Error(
        `Failed to find port bindings in docker inspect for ${validatedContainerId}`,
      );
    }
    // Security audit: ensure strictly no 0.0.0.0 or :: binding exists
    for (const binding of portBindings) {
      if (binding.HostIp !== '127.0.0.1') {
        throw new Error(
          `[SECURITY AUDIT] Insecure Redis port binding detected on ${validatedContainerId}: HostIp='${binding.HostIp}'. Expected 127.0.0.1 only.`,
        );
      }
    }
    redisPort = Number(portBindings[0].HostPort);
    console.log(
      `[E2E DISPOSABLE SETUP] Dedicated Redis container verified (HostIp=127.0.0.1, HostPort=${redisPort})`,
    );

    // Wait until Redis container is accepting connections
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        const pingRedis = new Redis({
          host: '127.0.0.1',
          port: redisPort,
          lazyConnect: true,
          connectTimeout: 500,
        });
        await pingRedis.connect();
        const pong = await pingRedis.ping();
        await pingRedis.quit();
        if (pong === 'PONG') {
          ready = true;
          break;
        }
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    if (!ready) {
      throw new Error(
        `Dedicated Redis container ${validatedContainerId} did not respond to PING within 3s.`,
      );
    }

    // 4. Run Prisma migrations on the disposable database
    console.log(
      '[E2E DISPOSABLE SETUP] Applying Prisma migrations to disposable database...',
    );
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    execFileSync(npxCmd, ['prisma', 'migrate', 'deploy'], {
      cwd: join(__dirname, '..'),
      env: {
        ...process.env,
        DATABASE_URL: disposableDbUrl,
      },
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });

    // 5. Persist disposable metadata for test workers and globalTeardown
    // Security Directive: Do NOT save plaintext credentials in files. Store only identifiers.
    const sessionData = {
      sessionId,
      disposableDbName,
      redisContainerName,
      redisContainerId: validatedContainerId,
      redisPort: String(redisPort),
      redisDb: '1',
      createdAt: new Date().toISOString(),
    };

    writeFileSync(specificSessionPath, JSON.stringify(sessionData, null, 2));

    process.env.TEST_DATABASE_URL = disposableDbUrl;
    process.env.DATABASE_URL = disposableDbUrl;
    process.env.REDIS_HOST = '127.0.0.1';
    process.env.REDIS_PORT = String(redisPort);
    process.env.TEST_REDIS_DB = '1';
    process.env.REDIS_DB = '1';

    console.log('[E2E DISPOSABLE SETUP] Disposable environment ready.\n');
  } catch (setupError: any) {
    console.error(
      `[E2E DISPOSABLE SETUP ERROR] Setup failed: ${setupError?.message}. Rolling back allocated resources...`,
    );

    // Rollback Redis container if spawned
    if (redisContainerCreated) {
      try {
        const target = validatedContainerId || redisContainerName;
        execFileSync('docker', ['rm', '-f', target], { stdio: 'ignore' });
        console.log(
          `[E2E SETUP ROLLBACK] Destroyed orphan Redis container ${target}.`,
        );
      } catch (err: any) {
        console.error(
          `[E2E SETUP ROLLBACK ERROR] Failed to destroy container: ${err?.message}`,
        );
      }
    }

    // Rollback PostgreSQL database if created
    if (disposableDbCreated && disposableDbName) {
      try {
        const pgClient = new Client({ connectionString: adminUrl });
        pgClient.on('error', () => {});
        await pgClient.connect();
        await pgClient.query(
          `DROP DATABASE IF EXISTS ${disposableDbName} WITH (FORCE);`,
        );
        await pgClient.end();
        console.log(
          `[E2E SETUP ROLLBACK] Dropped orphan database ${disposableDbName}.`,
        );
      } catch (err: any) {
        console.error(
          `[E2E SETUP ROLLBACK ERROR] Failed to drop database: ${err?.message}`,
        );
      }
    }

    // Rollback session file if written
    if (existsSync(specificSessionPath)) {
      try {
        unlinkSync(specificSessionPath);
      } catch {
        // ignore
      }
    }

    throw setupError;
  }
}
