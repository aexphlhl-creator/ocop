/**
 * E2E Test Harness Security & Safety Validations
 * Enforces strict constraints on dynamic resource identifiers to eliminate shell injection,
 * unintended resource collisions, and orphan resource leaks.
 */

export const SESSION_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
export const CONTAINER_ID_REGEX = /^[a-f0-9]{12,64}$/i;

export function validateSessionId(sessionId: string): string {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('[E2E SAFETY GUARD] Session ID must be a non-empty string.');
  }
  if (!SESSION_ID_REGEX.test(sessionId)) {
    throw new Error(
      `[E2E SAFETY GUARD] Invalid session ID '${sessionId}'. Session ID must match ${SESSION_ID_REGEX} and must not contain shell metacharacters, quotes, or whitespace.`,
    );
  }
  return sessionId;
}

export function validateContainerId(containerId: string): string {
  if (!containerId || typeof containerId !== 'string') {
    throw new Error('[E2E SAFETY GUARD] Container ID must be a non-empty string.');
  }
  const cleanId = containerId.trim();
  if (!CONTAINER_ID_REGEX.test(cleanId)) {
    throw new Error(
      `[E2E SAFETY GUARD] Invalid container ID '${containerId}'. Must be a 12-64 character hexadecimal string.`,
    );
  }
  return cleanId;
}

export function buildDisposableDbName(sessionId: string): string {
  const validId = validateSessionId(sessionId);
  return `ocop_e2e_disp_${validId}`;
}

export function buildRedisContainerName(sessionId: string): string {
  const validId = validateSessionId(sessionId);
  return `ocop_redis_disp_${validId}`;
}

export interface TeardownPlan {
  sessionId: string;
  expectedDbName: string;
  expectedContainerName: string;
  targetContainerId: string;
}

export function verifyTeardownPlan(params: {
  envSessionId?: string;
  metadata: {
    sessionId?: string;
    disposableDbName?: string;
    redisContainerName?: string;
    redisContainerId?: string;
  };
  testDatabaseUrl?: string;
}): TeardownPlan {
  if (!params.testDatabaseUrl || !params.testDatabaseUrl.trim()) {
    throw new Error(
      '[E2E SAFETY GUARD] Execution aborted: TEST_DATABASE_URL must be explicitly declared for teardown.',
    );
  }

  if (!params.envSessionId || !params.envSessionId.trim()) {
    throw new Error(
      '[E2E SAFETY GUARD] Execution aborted: E2E_SESSION_ID must be specified.',
    );
  }

  const validatedEnvSessionId = validateSessionId(params.envSessionId);
  const metadata = params.metadata;

  if (!metadata || typeof metadata !== 'object') {
    throw new Error('[E2E SAFETY GUARD] Invalid session metadata: must be an object.');
  }

  // 1. Session ID presence and exact match
  if (!metadata.sessionId || typeof metadata.sessionId !== 'string') {
    throw new Error(
      `[E2E SAFETY GUARD] Incomplete metadata: sessionId is required and must match '${validatedEnvSessionId}'.`,
    );
  }
  if (metadata.sessionId !== validatedEnvSessionId) {
    throw new Error(
      `[E2E SAFETY GUARD] Session ID mismatch: metadata contains '${metadata.sessionId}', but environment is '${validatedEnvSessionId}'. Teardown refused.`,
    );
  }

  const expectedDbName = buildDisposableDbName(validatedEnvSessionId);
  const expectedContainerName = buildRedisContainerName(validatedEnvSessionId);

  // 2. Database name presence and strict deterministic match
  if (!metadata.disposableDbName || typeof metadata.disposableDbName !== 'string') {
    throw new Error(
      `[E2E SAFETY GUARD] Incomplete metadata: disposableDbName is required and must match expected deterministic name '${expectedDbName}'.`,
    );
  }
  if (metadata.disposableDbName !== expectedDbName) {
    throw new Error(
      `[E2E SAFETY GUARD] Tampered metadata detected! metadata.disposableDbName '${metadata.disposableDbName}' does not match expected deterministic name '${expectedDbName}'. Refusing to DROP DATABASE.`,
    );
  }

  // 3. Container name presence and strict deterministic match
  if (!metadata.redisContainerName || typeof metadata.redisContainerName !== 'string') {
    throw new Error(
      `[E2E SAFETY GUARD] Incomplete metadata: redisContainerName is required and must match expected deterministic name '${expectedContainerName}'.`,
    );
  }
  if (metadata.redisContainerName !== expectedContainerName) {
    throw new Error(
      `[E2E SAFETY GUARD] Tampered metadata detected! metadata.redisContainerName '${metadata.redisContainerName}' does not match expected deterministic name '${expectedContainerName}'. Refusing to destroy container.`,
    );
  }

  // 4. Redis container ID presence and strict hexadecimal validation
  if (!metadata.redisContainerId || typeof metadata.redisContainerId !== 'string') {
    throw new Error(
      `[E2E SAFETY GUARD] Incomplete metadata: redisContainerId is required and must be a 12-64 char hexadecimal string.`,
    );
  }
  const validatedContainerId = validateContainerId(metadata.redisContainerId);

  return {
    sessionId: validatedEnvSessionId,
    expectedDbName,
    expectedContainerName,
    targetContainerId: validatedContainerId,
  };
}
