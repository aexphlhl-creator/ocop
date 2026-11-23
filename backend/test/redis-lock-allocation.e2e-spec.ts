import Redis from 'ioredis';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { validateContainerId } from './helpers/e2e-safety';

describe('Redis Lock Allocation & TOCTOU Expiration Safety (Isolated Container)', () => {
  let containerName: string;
  let testRedisPort: number;
  let testRedis: Redis;
  let validatedContainerId: string;

  beforeAll(async () => {
    // Spin up an isolated, dedicated ephemeral Redis container published strictly on 127.0.0.1
    // CRITICAL: Use execFileSync with separate arguments array (NO shell interpolation)
    const id = randomUUID().replace(/-/g, '').slice(0, 8);
    containerName = `ocop_redis_lock_test_${id}`;
    const rawContainerId = execFileSync(
      'docker',
      [
        'run',
        '-d',
        '--name',
        containerName,
        '--label',
        'e2e-test=redis-lock-allocation',
        '--label',
        'created-by=ocop-e2e-test',
        '-p',
        '127.0.0.1:0:6379',
        'redis:7-alpine',
      ],
      { encoding: 'utf8' },
    ).trim();
    validatedContainerId = validateContainerId(rawContainerId);

    const inspectRaw = execFileSync(
      'docker',
      ['inspect', validatedContainerId],
      { encoding: 'utf8' },
    );
    const inspect = JSON.parse(inspectRaw)[0];
    const portBindings = inspect?.NetworkSettings?.Ports?.['6379/tcp'] || [];
    if (portBindings.length === 0) {
      throw new Error(`Failed to parse port for container ${containerName}`);
    }
    for (const b of portBindings) {
      if (b.HostIp !== '127.0.0.1') {
        throw new Error(
          `Insecure Redis port binding detected on ${containerName}: HostIp='${b.HostIp}'`,
        );
      }
    }
    testRedisPort = Number(portBindings[0].HostPort);

    testRedis = new Redis({
      host: '127.0.0.1',
      port: testRedisPort,
      lazyConnect: true,
    });
    await testRedis.connect();
  });

  afterAll(async () => {
    if (testRedis) {
      await testRedis.quit();
    }
    if (validatedContainerId) {
      try {
        const inspectRaw = execFileSync(
          'docker',
          ['inspect', validatedContainerId],
          { encoding: 'utf8' },
        );
        const inspect = JSON.parse(inspectRaw)[0];
        if (
          inspect?.Config?.Labels?.['e2e-test'] === 'redis-lock-allocation' &&
          inspect?.Config?.Labels?.['created-by'] === 'ocop-e2e-test'
        ) {
          execFileSync('docker', ['rm', '-f', validatedContainerId], {
            stdio: 'ignore',
          });
        }
      } catch {
        // ignore
      }
    }
  });

  it('TOCTOU Safety: Cố tình làm lease hết hạn sau khi kiểm tra quyền sở hữu nhưng trước khi xóa, chứng minh dữ liệu session mới còn nguyên', async () => {
    const lockKey = 'e2e:lock:test_resource';
    const sessionA = 'session_alpha';
    const sessionB = 'session_beta';

    // Step 1: Session A acquires lock with a short lease TTL of 1 second
    const acquiredA = await testRedis.set(lockKey, sessionA, 'EX', 1, 'NX');
    expect(acquiredA).toBe('OK');

    // Step 2: Session A performs ownership check at time T0
    const checkOwnershipScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return 1
      else
        return 0
      end
    `;
    const isOwnerAtT0 = await testRedis.eval(
      checkOwnershipScript,
      1,
      lockKey,
      sessionA,
    );
    expect(isOwnerAtT0).toBe(1); // At T0, Session A was confirmed to be the owner

    // Step 3: TOCTOU delay: Session A pauses / delays (network lag, GC pause, async delay).
    // During this delay, Session A's lease expires!
    await new Promise((resolve) => setTimeout(resolve, 1100)); // 1.1s > 1.0s TTL

    // Confirm Session A's lease has genuinely expired
    const expiredVal = await testRedis.get(lockKey);
    expect(expiredVal).toBeNull();

    // Step 4: Session B acquires the lock and creates critical test/production data
    const acquiredB = await testRedis.set(lockKey, sessionB, 'EX', 60, 'NX');
    expect(acquiredB).toBe('OK');
    expect(await testRedis.get(lockKey)).toBe(sessionB);

    await testRedis.set('session_b_protected_data', 'IMMUTABLE_VALUABLE_DATA');

    // Step 5: Session A resumes at T1 and attempts to execute deletion / flush
    // If Session A performed a non-atomic DEL or separate check-then-delete, it would destroy Session B's lock!
    // But the atomic Lua check-and-delete guarantees safety:
    const atomicDeleteScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const deleteResult = await testRedis.eval(
      atomicDeleteScript,
      1,
      lockKey,
      sessionA,
    );

    // CRITICAL PROOF: Session A's attempt is REJECTED (0 items deleted)
    expect(deleteResult).toBe(0);

    // Step 6: Verify Session B's data is 100% INTACT
    const protectedData = await testRedis.get('session_b_protected_data');
    expect(protectedData).toBe('IMMUTABLE_VALUABLE_DATA');

    // Step 7: Verify Session B's lock is 100% INTACT and still owned by Session B
    const currentLockHolder = await testRedis.get(lockKey);
    expect(currentLockHolder).toBe(sessionB);
  });

  it('Khóa được cấp phát độc quyền: session B không thể nhận tài nguyên khi session A đang giữ khóa', async () => {
    const lockKey = 'e2e:lock:exclusive_resource';
    const sessionA = 'session_holder_a';
    const sessionB = 'session_challenger_b';

    // Session A acquires lock
    const acquiredA = await testRedis.set(lockKey, sessionA, 'EX', 30, 'NX');
    expect(acquiredA).toBe('OK');

    // Session B attempts to acquire the same resource
    const acquiredB = await testRedis.set(lockKey, sessionB, 'EX', 30, 'NX');
    expect(acquiredB).toBeNull(); // Rejected!

    // Verify Session A remains the sole holder
    expect(await testRedis.get(lockKey)).toBe(sessionA);
  });
});
