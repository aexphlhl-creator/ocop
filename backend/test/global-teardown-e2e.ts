import { Client } from 'pg';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';
import {
  validateSessionId,
  validateContainerId,
  verifyTeardownPlan,
  TeardownPlan,
} from './helpers/e2e-safety';

export default async function globalTeardown() {
  console.log(
    '\n[E2E DISPOSABLE TEARDOWN] Cleaning up and destroying disposable resources...',
  );

  const rawSessionId = process.env.E2E_SESSION_ID;
  if (!rawSessionId || !rawSessionId.trim()) {
    console.log('[E2E DISPOSABLE TEARDOWN] No E2E_SESSION_ID specified.');
    return;
  }

  // Security Guard: Validate E2E_SESSION_ID before constructing file paths
  const sessionId = validateSessionId(rawSessionId);
  const sessionPath = join(__dirname, `.e2e-session-${sessionId}.json`);
  if (!existsSync(sessionPath)) {
    console.log(
      `[E2E DISPOSABLE TEARDOWN] No active session file found for session: ${sessionId}`,
    );
    return;
  }

  const envUrl = process.env.TEST_DATABASE_URL;
  if (!envUrl || !envUrl.trim()) {
    console.error(
      '[E2E DISPOSABLE TEARDOWN] Execution aborted: TEST_DATABASE_URL must be explicitly declared for teardown.',
    );
    throw new Error(
      '[E2E SAFETY GUARD] Execution aborted: TEST_DATABASE_URL must be explicitly declared for teardown.',
    );
  }

  let session: any;
  let plan: TeardownPlan;

  try {
    session = JSON.parse(readFileSync(sessionPath, 'utf8'));
    // Rigorous verification: Recomputes expected database and container names
    // Refuses teardown if metadata was tampered or does not match environment
    plan = verifyTeardownPlan({
      envSessionId: sessionId,
      metadata: session,
      testDatabaseUrl: envUrl,
    });
  } catch (err: any) {
    console.error(
      `[E2E DISPOSABLE TEARDOWN] Failed to validate session metadata at ${sessionPath}:`,
      err?.message,
    );
    throw err;
  }

  // Handle expected connection termination events when dropping disposable database
  process.on('uncaughtException', (err: any) => {
    if (
      err?.code === '57P01' ||
      err?.message?.includes('terminating connection')
    ) {
      return;
    }
    console.error('[UNCAUGHT]', err);
  });

  // Simulated teardown failure scenario for verification
  if (process.env.SIMULATE_TEARDOWN_FAILURE === 'true') {
    console.error(
      `[E2E DISPOSABLE TEARDOWN] SIMULATED FAILURE: Intentionally failing teardown for session ${session.sessionId}. Preserving metadata at ${sessionPath} for investigation.`,
    );
    throw new Error(
      `[E2E DISPOSABLE TEARDOWN ERROR] Simulated teardown failure for session ${session.sessionId}`,
    );
  }

  const errors: Error[] = [];
  const residualResources: string[] = [];

  // 1. Terminate all active backend connections and DROP ONLY this session's database
  // Note: Uses plan.expectedDbName strictly derived from session ID (never trusts raw metadata strings)
  try {
    if (process.env.SIMULATE_DB_DROP_FAILURE === 'true') {
      throw new Error('Simulated database drop failure');
    }

    const urlObj = new URL(envUrl);
    urlObj.pathname = '/postgres';
    const pgClient = new Client({ connectionString: urlObj.toString() });
    pgClient.on('error', () => {});
    await pgClient.connect();

    await pgClient.query(
      `DROP DATABASE IF EXISTS ${plan.expectedDbName} WITH (FORCE);`,
    );
    await pgClient.end();
    console.log(
      `[E2E DISPOSABLE TEARDOWN] Dropped disposable PostgreSQL database: ${plan.expectedDbName}`,
    );
  } catch (err: any) {
    console.error(
      `[E2E DISPOSABLE TEARDOWN] Failed to drop database ${plan.expectedDbName}:`,
      err?.message,
    );
    errors.push(err);
    residualResources.push(`PostgreSQL Database: ${plan.expectedDbName}`);
  }

  // 2. Teardown ONLY this session's dedicated Redis container
  // Verifying container ID and label before destroy via execFileSync (strictly NO shell interpolation, NO FLUSHALL)
  try {
    const targetIdentifier = plan.targetContainerId;
    // Step A: Inspect container before removal to strictly verify ownership
    let inspectRaw: string = '';
    try {
      inspectRaw = execFileSync('docker', ['inspect', targetIdentifier], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (inspectErr: any) {
      const errMsg = (
        inspectErr?.stderr ||
        inspectErr?.message ||
        ''
      ).toString();
      if (
        errMsg.includes('no such') ||
        errMsg.includes('No such') ||
        errMsg.includes('not found')
      ) {
        // Container does not exist in docker; already cleanly removed
        console.log(
          `[E2E DISPOSABLE TEARDOWN] Redis container ${targetIdentifier} does not exist (already destroyed).`,
        );
        inspectRaw = '';
      } else {
        throw inspectErr;
      }
    }

    if (inspectRaw && inspectRaw.trim()) {
      const inspect = JSON.parse(inspectRaw)[0];
      const verifiedContainerId = validateContainerId(inspect.Id);

      const labelSessionId = inspect?.Config?.Labels?.['e2e-session-id'];
      if (labelSessionId !== plan.sessionId) {
        throw new Error(
          `Security violation: Container ${verifiedContainerId} has label e2e-session-id='${labelSessionId}', ` +
            `which does NOT match this session '${plan.sessionId}'. Teardown refused.`,
        );
      }

      if (!verifiedContainerId.startsWith(plan.targetContainerId)) {
        throw new Error(
          `Security violation: Verified container ID '${verifiedContainerId}' does not match expected container ID '${plan.targetContainerId}'. Teardown refused.`,
        );
      }

      // Step B: Verified ownership. Stop and remove ONLY this verified container ID
      execFileSync('docker', ['rm', '-f', verifiedContainerId], {
        stdio: 'ignore',
      });
      console.log(
        `[E2E DISPOSABLE TEARDOWN] Verified ownership and destroyed dedicated Redis container: ${plan.expectedContainerName} (ID: ${verifiedContainerId.slice(0, 12)})`,
      );
    }
  } catch (err: any) {
    console.error(
      `[E2E DISPOSABLE TEARDOWN] Failed to verify or destroy container:`,
      err?.message,
    );
    errors.push(err);
    residualResources.push(
      `Redis Container: ${plan.expectedContainerName} (${plan.targetContainerId})`,
    );
  }

  // 3. If any step failed, DO NOT delete session file! Keep it for post-mortem remediation
  if (errors.length > 0) {
    console.error(
      `[E2E DISPOSABLE TEARDOWN] Teardown failed with ${errors.length} error(s). Metadata PRESERVED at ${sessionPath} for forensic analysis.`,
    );
    console.error(
      `[E2E DISPOSABLE TEARDOWN] Uncleaned residual resources remaining:`,
    );
    for (const r of residualResources) {
      console.error(`  - ${r}`);
    }
    throw new Error(
      `[E2E DISPOSABLE TEARDOWN ERROR] Teardown failed with ${errors.length} error(s). Uncleaned resources: ${residualResources.join(', ')}`,
    );
  }

  // 4. Delete session file only upon complete successful cleanup
  // CRITICAL: Any failure to unlink metadata must fail the teardown, NOT report completion!
  try {
    if (process.env.SIMULATE_METADATA_UNLINK_FAILURE === 'true') {
      throw new Error('Simulated metadata unlink failure');
    }
    if (existsSync(sessionPath)) {
      unlinkSync(sessionPath);
    }
  } catch (unlinkErr: any) {
    console.error(
      `[E2E DISPOSABLE TEARDOWN ERROR] Failed to unlink session metadata file at ${sessionPath}:`,
      unlinkErr?.message,
    );
    console.error(
      `[E2E DISPOSABLE TEARDOWN ERROR] Uncleaned residual resources remaining:\n  - Metadata File: ${sessionPath}`,
    );
    throw new Error(
      `[E2E DISPOSABLE TEARDOWN ERROR] Failed to delete session metadata file: ${unlinkErr?.message}. Uncleaned resource: Metadata File: ${sessionPath}`,
    );
  }

  console.log(
    '[E2E DISPOSABLE TEARDOWN] Teardown complete: 0 residual test records remain in database or Redis.\n',
  );
}
