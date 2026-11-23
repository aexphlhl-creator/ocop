import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';

// Load disposable session metadata if spawned by globalSetup
const sessionId = process.env.E2E_SESSION_ID;
if (sessionId) {
  const specificSessionPath = join(__dirname, `.e2e-session-${sessionId}.json`);
  if (existsSync(specificSessionPath)) {
    try {
      const session = JSON.parse(readFileSync(specificSessionPath, 'utf8'));
      if (session.disposableDbName && process.env.TEST_DATABASE_URL) {
        const urlObj = new URL(process.env.TEST_DATABASE_URL);
        urlObj.pathname = `/${session.disposableDbName}`;
        process.env.TEST_DATABASE_URL = urlObj.toString();
        process.env.DATABASE_URL = urlObj.toString();
      }
      if (session.redisPort) {
        process.env.REDIS_HOST = '127.0.0.1';
        process.env.REDIS_PORT = session.redisPort;
      }
      if (session.redisDb !== undefined) {
        process.env.TEST_REDIS_DB = session.redisDb;
        process.env.REDIS_DB = session.redisDb;
      }
    } catch {
      // ignore
    }
  }
}

function redactUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.password || parsed.username) {
      parsed.username = '***';
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return rawUrl.replace(/\/\/[^@]+@/, '//***:***@');
  }
}

// 1. Strict E2E environment guard
const nodeEnv = process.env.NODE_ENV || 'test';
if (nodeEnv === 'production') {
  throw new Error(
    '[E2E SAFETY GUARD] Execution aborted: NODE_ENV cannot be production during E2E tests.',
  );
}
process.env.NODE_ENV = 'test';
process.env.DEMO_MODE = 'true';
process.env.PORT = process.env.PORT || '3001';

// 2. Strict TEST_DATABASE_URL requirement
// Never rely on default fallback or presence of "localhost" / "test" substring as safety proof
const testDbUrl = process.env.TEST_DATABASE_URL;
if (!testDbUrl || !testDbUrl.trim()) {
  throw new Error(
    '[E2E SAFETY GUARD] Execution aborted: TEST_DATABASE_URL must be explicitly declared for E2E tests. ' +
      'Implicit fallback to DATABASE_URL, localhost, or dev database is strictly prohibited.',
  );
}

const sanitizedDbUrl = redactUrl(testDbUrl);

// Ensure test database is not pointing to a production instance
if (
  testDbUrl.toLowerCase().includes('prod') ||
  testDbUrl.toLowerCase().includes('production')
) {
  throw new Error(
    `[E2E SAFETY GUARD] Execution aborted: TEST_DATABASE_URL appears to target a production database: ${sanitizedDbUrl}`,
  );
}

// Override DATABASE_URL for Prisma and Nest app to strictly use TEST_DATABASE_URL
process.env.DATABASE_URL = testDbUrl;

// 3. Strict Redis test isolation requirement
// Dedicated test Redis URL or dedicated DB index must be explicitly declared
const testRedisUrl = process.env.TEST_REDIS_URL;
const testRedisDb = process.env.TEST_REDIS_DB;

if (!testRedisUrl && !testRedisDb) {
  throw new Error(
    '[E2E SAFETY GUARD] Execution aborted: Either TEST_REDIS_URL or TEST_REDIS_DB must be explicitly declared for E2E isolation. ' +
      'Implicit fallback to default application Redis (db 0) is strictly prohibited.',
  );
}

if (testRedisUrl) {
  try {
    const parsedRedis = new URL(testRedisUrl);
    process.env.REDIS_HOST = parsedRedis.hostname;
    process.env.REDIS_PORT = parsedRedis.port || '6379';
    if (parsedRedis.password) {
      process.env.REDIS_PASSWORD = parsedRedis.password;
    }
    const pathDb = parsedRedis.pathname.replace('/', '');
    if (pathDb) {
      process.env.REDIS_DB = pathDb;
    }
  } catch {
    throw new Error(
      `[E2E SAFETY GUARD] Execution aborted: Invalid TEST_REDIS_URL format: ${redactUrl(testRedisUrl)}`,
    );
  }
} else if (testRedisDb) {
  if (testRedisDb === '0' && !process.env.ALLOW_REDIS_DB_0) {
    throw new Error(
      '[E2E SAFETY GUARD] Execution aborted: TEST_REDIS_DB cannot be 0 (default application database). Must use dedicated test database index (e.g. 1).',
    );
  }
  process.env.REDIS_DB = testRedisDb;
}

// 4. Security tokens and carrier secrets
process.env.JWT_SECRET =
  process.env.JWT_SECRET ||
  'test-jwt-secret-with-at-least-32-characters-for-security';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ||
  'test-jwt-refresh-secret-with-at-least-32-chars';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
process.env.CARRIER_WEBHOOK_SECRETS =
  process.env.CARRIER_WEBHOOK_SECRETS ||
  JSON.stringify({
    GHN: 'test-carrier-secret-that-is-longer-than-32-characters',
  });
