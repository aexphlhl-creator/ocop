/**
 * OCOP Disaster Recovery: Independent S3 Backup Monitor
 * 
 * Verifies S3 cold storage archives independently of the backup creation job.
 * Does NOT rely on local disk mtime.
 * Directly queries S3/MinIO bucket for:
 * 1. Existence of full object triplets (.dump, .sha256, .sha256.sig) for every backup set.
 * 2. Independent cryptographic verification (SHA-256 Checksum Parity & HMAC Origin Authenticity) of the latest replica.
 * 3. Detection of incomplete or failed uploads (0 bytes, missing manifest, missing signature).
 * 4. Detection of missed CronJobs (no new backup after expected schedule interval).
 * 5. Detection of stale backups approaching or breaching operational RPO targets.
 */

import { Client as MinioClient } from 'minio';
import { createHash } from 'crypto';
import { maskWebhookUrl, sendAlert } from './production-backup.mjs';
import {
  parseManifestSha256,
  verifyManifestSignature,
} from './production-restore.mjs';
import 'dotenv/config';

export function parseBackupTimestamp(objectName, lastModified) {
  if (typeof objectName === 'string') {
    // Expected format: ocop_backup_<tier>_YYYY-MM-DDTHH-mm-ss-SSSZ.dump
    const match = objectName.match(/ocop_backup_[a-zA-Z0-9]+_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/);
    if (match && match[1]) {
      const isoStr = match[1].replace(/-/g, (m, offset) => {
        if (offset === 13 || offset === 16) return ':';
        if (offset === 19) return '.';
        return '-';
      });
      const parsedTime = new Date(isoStr).getTime();
      if (!isNaN(parsedTime)) {
        return parsedTime;
      }
    }
  }
  if (lastModified) {
    const parsed = new Date(lastModified).getTime();
    if (!isNaN(parsed)) return parsed;
  }
  return 0;
}

/**
 * Computes SHA-256 hash of a stream in constant O(1) RAM with:
 * 1. Chunk inactivity / idle timeout: reset whenever a data chunk is received.
 * 2. Total overall timeout: absolute deadline to prevent infinite or trickle streaming.
 * 3. Continuous memory sampling across chunks.
 */
export async function computeStreamSha256(dataStream, options = {}) {
  const inactivityTimeoutMs = Number(
    options.inactivityTimeoutMs !== undefined
      ? options.inactivityTimeoutMs
      : (options.idleTimeoutMs !== undefined
          ? options.idleTimeoutMs
          : (options.timeoutMs !== undefined
              ? options.timeoutMs
              : (process.env.S3_STREAM_INACTIVITY_TIMEOUT_MS || process.env.S3_STREAM_IDLE_TIMEOUT_MS || process.env.S3_STREAM_TIMEOUT_MS || 60000)))
  );

  const totalTimeoutMs = Number(
    options.totalTimeoutMs !== undefined
      ? options.totalTimeoutMs
      : (process.env.S3_STREAM_TOTAL_TIMEOUT_MS || (inactivityTimeoutMs > 0 ? Math.max(600000, inactivityTimeoutMs * 10) : 600000))
  );

  const onChunk = typeof options.onChunk === 'function' ? options.onChunk : null;

  if (!dataStream) {
    throw new Error('computeStreamSha256: dataStream is undefined or null');
  }

  // Handle Buffer or String directly (useful for tests or small inputs)
  if (Buffer.isBuffer(dataStream)) {
    if (onChunk) onChunk(dataStream);
    return createHash('sha256').update(dataStream).digest('hex');
  }
  if (typeof dataStream === 'string') {
    if (onChunk) onChunk(dataStream);
    return createHash('sha256').update(dataStream).digest('hex');
  }

  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    let hasEnded = false;
    let inactivityTimer = null;
    let totalTimer = null;

    const cleanup = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      if (totalTimer) clearTimeout(totalTimer);
    };

    const resetInactivityTimer = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      if (inactivityTimeoutMs > 0 && !hasEnded) {
        inactivityTimer = setTimeout(() => {
          if (!hasEnded) {
            hasEnded = true;
            cleanup();
            const err = new Error(`S3 stream download timed out after ${inactivityTimeoutMs}ms of inactivity (no chunks received)`);
            err.code = 'STREAM_INACTIVITY_TIMEOUT';
            if (typeof dataStream.destroy === 'function') {
              dataStream.destroy(err);
            }
            reject(err);
          }
        }, inactivityTimeoutMs);
      }
    };

    if (totalTimeoutMs > 0) {
      totalTimer = setTimeout(() => {
        if (!hasEnded) {
          hasEnded = true;
          cleanup();
          const err = new Error(`S3 stream download exceeded total overall deadline of ${totalTimeoutMs}ms`);
          err.code = 'STREAM_TOTAL_TIMEOUT';
          if (typeof dataStream.destroy === 'function') {
            dataStream.destroy(err);
          }
          reject(err);
        }
      }, totalTimeoutMs);
    }

    // Arm initial inactivity timer waiting for the first chunk
    resetInactivityTimer();

    // Handle AsyncIterable (Readable streams in modern Node)
    if (typeof dataStream[Symbol.asyncIterator] === 'function') {
      (async () => {
        try {
          for await (const chunk of dataStream) {
            resetInactivityTimer();
            if (onChunk) onChunk(chunk);
            hash.update(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          cleanup();
          if (!hasEnded) {
            hasEnded = true;
            resolve(hash.digest('hex'));
          }
        } catch (streamErr) {
          cleanup();
          if (!hasEnded) {
            hasEnded = true;
            reject(streamErr);
          }
        }
      })();
      return;
    }

    // Handle EventEmitter / Readable stream with .on
    if (typeof dataStream.on === 'function') {
      dataStream.on('data', (chunk) => {
        try {
          resetInactivityTimer();
          if (onChunk) onChunk(chunk);
          hash.update(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        } catch (updateErr) {
          cleanup();
          if (!hasEnded) {
            hasEnded = true;
            reject(updateErr);
          }
        }
      });
      dataStream.on('end', () => {
        cleanup();
        if (!hasEnded) {
          hasEnded = true;
          resolve(hash.digest('hex'));
        }
      });
      dataStream.on('error', (err) => {
        cleanup();
        if (!hasEnded) {
          hasEnded = true;
          reject(err);
        }
      });
      return;
    }

    cleanup();
    reject(new Error('computeStreamSha256: Input is not a readable stream, AsyncIterable, or Buffer'));
  });
}

/**
 * Opens an S3 object stream with an explicit open-phase deadline.
 * If the promise returned by s3Client.getObject() does not resolve within openTimeoutMs,
 * the operation rejects with GET_OBJECT_TIMEOUT.
 * If the promise resolves after the deadline has expired, any returned stream is immediately cancelled/destroyed.
 */
export async function openS3ObjectWithDeadline(s3Client, bucket, objectName, options = {}) {
  const openTimeoutMs = Number(
    options.openTimeoutMs !== undefined
      ? options.openTimeoutMs
      : (options.getObjectTimeoutMs !== undefined
          ? options.getObjectTimeoutMs
          : (options.timeoutMs !== undefined
              ? options.timeoutMs
              : (process.env.S3_GET_OBJECT_TIMEOUT_MS || process.env.S3_CONNECT_TIMEOUT_MS || 15000)))
  );

  if (!s3Client || typeof s3Client.getObject !== 'function') {
    throw new Error(`s3Client does not support getObject for '${objectName}'`);
  }

  if (openTimeoutMs <= 0) {
    return await s3Client.getObject(bucket, objectName);
  }

  let timer = null;
  let timedOut = false;

  return new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      const err = new Error(`S3 getObject open operation timed out after ${openTimeoutMs}ms for '${objectName}'`);
      err.code = 'GET_OBJECT_TIMEOUT';
      reject(err);
    }, openTimeoutMs);

    Promise.resolve()
      .then(() => s3Client.getObject(bucket, objectName))
      .then((streamOrData) => {
        if (timedOut) {
          // Late resolution: safely cancel and destroy stream to release underlying socket without unhandled error
          if (streamOrData && typeof streamOrData.destroy === 'function') {
            try {
              // Attach no-op error handler BEFORE destroy to prevent Node.js ERR_UNHANDLED_ERROR
              if (typeof streamOrData.on === 'function') {
                streamOrData.on('error', () => {});
              }
              if (typeof streamOrData.resume === 'function') {
                streamOrData.resume();
              }
              streamOrData.destroy(new Error(`S3 getObject cancelled due to open timeout for '${objectName}'`));
            } catch {}
          }
          return;
        }
        if (timer) clearTimeout(timer);
        resolve(streamOrData);
      })
      .catch((err) => {
        if (timer) clearTimeout(timer);
        if (!timedOut) {
          reject(err);
        }
      });
  });
}

/**
 * Reads small text objects (manifest, signature) into memory with strict size limit and timeout to prevent memory exhaustion.
 */
export async function getS3TextObject(s3Client, bucket, objectName, options = {}) {
  const maxSizeBytes = Number(typeof options === 'number' ? options : (options.maxSizeBytes || 65536));
  const timeoutMs = Number(options.timeoutMs || process.env.S3_TEXT_TIMEOUT_MS || 15000);
  const openTimeoutMs = Number(
    options.openTimeoutMs !== undefined
      ? options.openTimeoutMs
      : (options.getObjectTimeoutMs !== undefined
          ? options.getObjectTimeoutMs
          : (process.env.S3_GET_OBJECT_TIMEOUT_MS || timeoutMs))
  );

  const data = await openS3ObjectWithDeadline(s3Client, bucket, objectName, {
    openTimeoutMs,
  });

  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf-8');

  return new Promise((resolve, reject) => {
    let bytesRead = 0;
    const chunks = [];
    let timer = null;

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        const timeoutErr = new Error(`S3 text object download timed out after ${timeoutMs}ms for '${objectName}'`);
        timeoutErr.code = 'STREAM_READ_TIMEOUT';
        if (typeof data.destroy === 'function') {
          try { data.destroy(timeoutErr); } catch {}
        }
        reject(timeoutErr);
      }, timeoutMs);
    }

    const cleanup = () => {
      if (timer) clearTimeout(timer);
    };

    if (data && typeof data[Symbol.asyncIterator] === 'function') {
      (async () => {
        try {
          for await (const chunk of data) {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            bytesRead += buf.length;
            if (bytesRead > maxSizeBytes) {
              cleanup();
              const sizeErr = new Error(`Object '${objectName}' exceeded maximum text size limit of ${maxSizeBytes} bytes`);
              if (typeof data.destroy === 'function') {
                try { data.destroy(sizeErr); } catch {}
              }
              throw sizeErr;
            }
            chunks.push(buf);
          }
          cleanup();
          resolve(Buffer.concat(chunks).toString('utf-8'));
        } catch (err) {
          cleanup();
          reject(err);
        }
      })();
      return;
    }

    if (data && typeof data.on === 'function') {
      data.on('data', (c) => {
        const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
        bytesRead += buf.length;
        if (bytesRead > maxSizeBytes) {
          cleanup();
          const sizeErr = new Error(`Object '${objectName}' exceeded maximum text size limit of ${maxSizeBytes} bytes`);
          if (typeof data.destroy === 'function') {
            try { data.destroy(sizeErr); } catch {}
          }
          reject(sizeErr);
          return;
        }
        chunks.push(buf);
      });
      data.on('end', () => {
        cleanup();
        resolve(Buffer.concat(chunks).toString('utf-8'));
      });
      data.on('error', (err) => {
        cleanup();
        reject(err);
      });
      return;
    }

    cleanup();
    reject(new Error(`Unsupported stream/buffer type returned by getObject for ${objectName}`));
  });
}

export async function checkS3TierBackup(s3Client, bucket, tier, options = {}) {
  const prefix = options.s3Prefix !== undefined
    ? options.s3Prefix
    : (tier === 'drill' ? '' : `${tier}/`);

  const now = options.now || Date.now();
  const rpoTargetMinutes = Number(
    options.rpoTargetMinutes ||
    (tier === 'hourly'
      ? (process.env.HOURLY_RPO_MINUTES || 60)
      : (process.env.DAILY_RPO_HOURS ? Number(process.env.DAILY_RPO_HOURS) * 60 : 24 * 60)),
  );

  const rpoWarnMinutes = Number(
    options.rpoWarnMinutes ||
    (tier === 'hourly'
      ? (process.env.HOURLY_RPO_WARN_MINUTES || 50)
      : (process.env.DAILY_RPO_WARN_HOURS ? Number(process.env.DAILY_RPO_WARN_HOURS) * 60 : 22 * 60)),
  );

  const expectedIntervalMinutes = Number(
    options.expectedIntervalMinutes || (tier === 'hourly' ? 60 : 24 * 60),
  );
  const missedGracePeriodMinutes = Number(
    options.missedGracePeriodMinutes || (tier === 'hourly' ? 10 : 120),
  );
  const missedThresholdMinutes = expectedIntervalMinutes + missedGracePeriodMinutes;
  const hmacSecret = options.hmacSecret || process.env.BACKUP_HMAC_SECRET;

  const connectTimeoutMs = Number(options.connectTimeoutMs || process.env.S3_CONNECT_TIMEOUT_MS || 15000);
  const listTimeoutMs = Number(options.listTimeoutMs || process.env.S3_LIST_TIMEOUT_MS || 30000);
  const getObjectTimeoutMs = Number(
    options.getObjectTimeoutMs !== undefined
      ? options.getObjectTimeoutMs
      : (options.openTimeoutMs !== undefined
          ? options.openTimeoutMs
          : (process.env.S3_GET_OBJECT_TIMEOUT_MS || connectTimeoutMs))
  );
  const textTimeoutMs = Number(
    options.textTimeoutMs !== undefined
      ? options.textTimeoutMs
      : (process.env.S3_TEXT_TIMEOUT_MS || connectTimeoutMs)
  );
  const streamInactivityTimeoutMs = Number(
    options.inactivityTimeoutMs !== undefined
      ? options.inactivityTimeoutMs
      : (options.streamInactivityTimeoutMs !== undefined
          ? options.streamInactivityTimeoutMs
          : (options.streamTimeoutMs !== undefined
              ? options.streamTimeoutMs
              : (process.env.S3_STREAM_INACTIVITY_TIMEOUT_MS || process.env.S3_STREAM_IDLE_TIMEOUT_MS || process.env.S3_STREAM_TIMEOUT_MS || 60000)))
  );
  const streamTotalTimeoutMs = Number(
    options.totalTimeoutMs !== undefined
      ? options.totalTimeoutMs
      : (options.streamTotalTimeoutMs !== undefined
          ? options.streamTotalTimeoutMs
          : (process.env.S3_STREAM_TOTAL_TIMEOUT_MS || (streamInactivityTimeoutMs > 0 ? Math.max(600000, streamInactivityTimeoutMs * 10) : 600000)))
  );
  const monitorScheduleIntervalMinutes = Number(
    options.monitorScheduleIntervalMinutes || options.monitorIntervalMinutes || process.env.MONITOR_SCHEDULE_INTERVAL_MINUTES || 15
  );

  console.log(`[MONITOR-S3] Inspecting cold storage bucket '${bucket}' for tier '${tier}' under prefix '${prefix}' (Timeouts: connect=${connectTimeoutMs}ms, list=${listTimeoutMs}ms, getObject=${getObjectTimeoutMs}ms, streamInactivity=${streamInactivityTimeoutMs}ms, streamTotal=${streamTotalTimeoutMs}ms)...`);

  if (typeof s3Client.bucketExists === 'function') {
    try {
      let bTimer = null;
      const timeoutPromise = new Promise((_, reject) => {
        bTimer = setTimeout(() => reject(new Error(`S3 connection / bucketExists timed out after ${connectTimeoutMs}ms for '${bucket}'`)), connectTimeoutMs);
      });
      const exists = await Promise.race([
        s3Client.bucketExists(bucket).finally(() => { if (bTimer) clearTimeout(bTimer); }),
        timeoutPromise,
      ]);

      if (!exists) {
        return {
          tier,
          status: 'CRITICAL',
          prefix,
          totalObjectsFound: 0,
          validBackupsCount: 0,
          incompleteBackupsCount: 0,
          latestBackup: null,
          incompleteDumps: [],
          issues: [{
            severity: 'CRITICAL',
            code: 'BUCKET_NOT_FOUND',
            message: `S3 cold storage bucket '${bucket}' does not exist! Backups cannot be written or monitored.`,
          }],
          rpoTargetMinutes,
          rpoWarnMinutes,
        };
      }
    } catch (bErr) {
      return {
        tier,
        status: 'CRITICAL',
        prefix,
        totalObjectsFound: 0,
        validBackupsCount: 0,
        incompleteBackupsCount: 0,
        latestBackup: null,
        incompleteDumps: [],
        issues: [{
          severity: 'CRITICAL',
          code: 'S3_CONNECTION_ERROR',
          message: `Failed to connect to S3 cold storage bucket '${bucket}': ${bErr.message}`,
        }],
        rpoTargetMinutes,
        rpoWarnMinutes,
      };
    }
  }

  const objects = [];
  try {
    const stream = s3Client.listObjectsV2(bucket, prefix, true);
    await new Promise((resolve, reject) => {
      let lTimer = null;
      if (listTimeoutMs > 0) {
        lTimer = setTimeout(() => {
          if (typeof stream.destroy === 'function') stream.destroy();
          reject(new Error(`S3 listObjects timed out after ${listTimeoutMs}ms under prefix '${prefix}'`));
        }, listTimeoutMs);
      }
      stream.on('data', (obj) => {
        if (obj && obj.name) {
          objects.push(obj);
        }
      });
      stream.on('error', (err) => {
        if (lTimer) clearTimeout(lTimer);
        reject(err);
      });
      stream.on('end', () => {
        if (lTimer) clearTimeout(lTimer);
        resolve();
      });
    });
  } catch (listErr) {
    return {
      tier,
      status: 'CRITICAL',
      prefix,
      totalObjectsFound: 0,
      validBackupsCount: 0,
      incompleteBackupsCount: 0,
      latestBackup: null,
      incompleteDumps: [],
      issues: [{
        severity: 'CRITICAL',
        code: 'S3_LIST_ERROR',
        message: `Failed to list objects in S3 bucket '${bucket}' under prefix '${prefix}': ${listErr.message}`,
      }],
      rpoTargetMinutes,
      rpoWarnMinutes,
    };
  }

  const issues = [];
  const validDumps = [];
  const incompleteDumps = [];

  const manifestSet = new Set();
  const sigSet = new Set();
  const dumpObjects = [];

  for (const obj of objects) {
    const name = obj.name;
    if (name.endsWith('.dump.sha256.sig') || name.endsWith('.sha256.sig') || name.endsWith('.sig')) {
      sigSet.add(name);
    } else if (name.endsWith('.dump.sha256') || name.endsWith('.sha256')) {
      manifestSet.add(name);
    } else if (name.endsWith('.dump')) {
      dumpObjects.push(obj);
    }
  }

  // 1. Evaluate presence of object triplets: .dump, .sha256, .sha256.sig
  for (const dumpObj of dumpObjects) {
    const dumpName = dumpObj.name;
    const manifestName = manifestSet.has(`${dumpName}.sha256`)
      ? `${dumpName}.sha256`
      : (manifestSet.has(dumpName.replace(/\.dump$/, '.sha256')) ? dumpName.replace(/\.dump$/, '.sha256') : null);

    const sigName = sigSet.has(`${dumpName}.sha256.sig`)
      ? `${dumpName}.sha256.sig`
      : (sigSet.has(dumpName.replace(/\.dump$/, '.sha256.sig'))
        ? dumpName.replace(/\.dump$/, '.sha256.sig')
        : (sigSet.has(`${dumpName}.sig`) ? `${dumpName}.sig` : null));

    const isZeroByte = dumpObj.size === 0;
    const hasManifest = !!manifestName;
    const hasSig = !!sigName;

    if (isZeroByte || !hasManifest || !hasSig) {
      let reason = '';
      let code = 'UPLOAD_INCOMPLETE';
      if (isZeroByte) {
        reason = 'Zero-byte dump file';
      } else if (!hasManifest) {
        reason = 'Missing companion .sha256 manifest';
        code = 'MISSING_MANIFEST';
      } else if (!hasSig) {
        reason = 'Missing companion HMAC signature (.sha256.sig)';
        code = 'MISSING_SIGNATURE';
      }
      incompleteDumps.push({
        name: dumpName,
        size: dumpObj.size,
        hasManifest,
        hasSig,
        reason,
      });
      issues.push({
        severity: 'CRITICAL',
        code,
        message: `Incomplete S3 backup triplet: ${dumpName} (${reason})`,
      });
    } else {
      const timestampMs = parseBackupTimestamp(dumpName, dumpObj.lastModified);
      validDumps.push({
        name: dumpName,
        manifestName,
        sigName,
        size: dumpObj.size,
        lastModified: dumpObj.lastModified,
        timestampMs,
        ageMinutes: Math.max(0, (now - timestampMs) / (60 * 1000)),
        tripletVerified: true,
        integrityVerified: false,
      });
    }
  }

  // Sort valid triplets newest first
  validDumps.sort((a, b) => b.timestampMs - a.timestampMs);
  const latestBackup = validDumps.length > 0 ? validDumps[0] : null;

  let tierStatus = 'HEALTHY';

  if (!latestBackup) {
    tierStatus = 'CRITICAL';
    issues.push({
      severity: 'CRITICAL',
      code: 'ZERO_VALID_BACKUPS',
      message: `Zero valid backup triplets (.dump + .sha256 + .sig) found on S3 for tier '${tier}'! Backup CronJob has never completed successfully or storage prefix is empty.`,
    });
  } else {
    const ageMinutes = latestBackup.ageMinutes;

    // Check 1: Did CronJob fail to run / miss scheduled interval?
    if (ageMinutes > missedThresholdMinutes) {
      tierStatus = 'CRITICAL';
      issues.push({
        severity: 'CRITICAL',
        code: 'CRONJOB_MISSED',
        message: `CronJob for tier '${tier}' missed or failed silently. No new backup on S3 for ${ageMinutes.toFixed(1)}m (expected schedule: every ${expectedIntervalMinutes}m, missed threshold: ${missedThresholdMinutes}m).`,
      });
    }

    // Check 2: Has backup age breached operational RPO design target?
    if (ageMinutes >= rpoTargetMinutes) {
      tierStatus = 'CRITICAL';
      issues.push({
        severity: 'CRITICAL',
        code: 'RPO_BREACH',
        message: `Backup age on S3 (${ageMinutes.toFixed(1)}m) has EXCEEDED operational design target (${rpoTargetMinutes}m) for tier '${tier}'.`,
      });
    } else if (ageMinutes >= rpoWarnMinutes) {
      if (tierStatus !== 'CRITICAL') {
        tierStatus = 'WARNING';
      }
      issues.push({
        severity: 'WARNING',
        code: 'RPO_APPROACHING',
        message: `Backup age on S3 (${ageMinutes.toFixed(1)}m) is approaching operational design target (${rpoTargetMinutes}m) for tier '${tier}'. Next backup due immediately.`,
      });
    }

    // 2. CRYPTOGRAPHIC INTEGRITY VERIFICATION of newest replica
    try {
      console.log(`[MONITOR-S3] Performing independent streaming cryptographic integrity verification on newest replica: ${latestBackup.name}...`);
      const verStart = Date.now();
      const memBefore = process.memoryUsage();

      // Continuous memory sampler tracking peak RSS, Heap, and External memory throughout streaming
      const memTracker = {
        maxRss: memBefore.rss,
        maxHeapUsed: memBefore.heapUsed,
        maxExternal: memBefore.external || 0,
        sample() {
          const m = process.memoryUsage();
          if (m.rss > this.maxRss) this.maxRss = m.rss;
          if (m.heapUsed > this.maxHeapUsed) this.maxHeapUsed = m.heapUsed;
          if ((m.external || 0) > this.maxExternal) this.maxExternal = m.external;
        },
      };
      memTracker.sample();
      const samplerInterval = setInterval(() => memTracker.sample(), 10);
      if (typeof samplerInterval.unref === 'function') samplerInterval.unref();

      let computedHash = '';
      try {
        // 2a. Open dump stream with open-phase deadline & stream directly into SHA-256 in constant O(1) RAM
        const dumpStream = await openS3ObjectWithDeadline(s3Client, bucket, latestBackup.name, {
          openTimeoutMs: getObjectTimeoutMs,
        });
        computedHash = await computeStreamSha256(dumpStream, {
          inactivityTimeoutMs: streamInactivityTimeoutMs,
          totalTimeoutMs: streamTotalTimeoutMs,
          onChunk: () => memTracker.sample(),
        });
      } finally {
        clearInterval(samplerInterval);
        memTracker.sample();
      }

      // 2b. Read small text files (manifest, signature) into memory with strict size limit, open deadline & stream timeout
      const manifestText = await getS3TextObject(s3Client, bucket, latestBackup.manifestName, {
        openTimeoutMs: getObjectTimeoutMs,
        timeoutMs: textTimeoutMs,
      });
      const sigText = await getS3TextObject(s3Client, bucket, latestBackup.sigName, {
        openTimeoutMs: getObjectTimeoutMs,
        timeoutMs: textTimeoutMs,
      });

      const verDurationMs = Date.now() - verStart;
      const memAfter = process.memoryUsage();
      const peakRssMb = (memTracker.maxRss / (1024 * 1024)).toFixed(2);
      const peakHeapMb = (memTracker.maxHeapUsed / (1024 * 1024)).toFixed(2);
      const peakExternalMb = (memTracker.maxExternal / (1024 * 1024)).toFixed(2);
      const heapDeltaMb = ((memAfter.heapUsed - memBefore.heapUsed) / (1024 * 1024)).toFixed(2);
      const dumpBytes = latestBackup.size || 0;
      const throughputMBs = verDurationMs > 0 ? (((dumpBytes / (1024 * 1024)) / (verDurationMs / 1000))).toFixed(2) : 'N/A';
      const bandwidthMbps = verDurationMs > 0 ? ((((dumpBytes * 8) / (1024 * 1024)) / (verDurationMs / 1000))).toFixed(2) : 'N/A';

      // Margin calculated against 15-minute monitor schedule window
      const marginToNextMonitorRunMs = (monitorScheduleIntervalMinutes * 60 * 1000) - verDurationMs;
      const marginToNextTierRunMs = (expectedIntervalMinutes * 60 * 1000) - verDurationMs;

      latestBackup.metrics = {
        dumpBytes,
        verDurationMs,
        peakRssMb: Number(peakRssMb),
        peakHeapMb: Number(peakHeapMb),
        peakExternalMb: Number(peakExternalMb),
        heapDeltaMb: Number(heapDeltaMb),
        throughputMBs: Number(throughputMBs) || 0,
        bandwidthMbps: Number(bandwidthMbps) || 0,
        monitorScheduleIntervalMinutes,
        marginToNextMonitorRunMs,
        marginToNextTierRunMs,
        scheduleIntervalMinutes: expectedIntervalMinutes,
        limitNote: 'Verified with 5-10 MB representative staging dump. Large-scale capacity (e.g. 50 GB) must not be extrapolated without empirical staging load test.',
      };

      console.log(`[OPERATIONAL METRICS] Verified replica: ${latestBackup.name} | Size: ${dumpBytes} bytes (${(dumpBytes / (1024 * 1024)).toFixed(2)} MB)`);
      console.log(`[OPERATIONAL METRICS] Duration: ${verDurationMs} ms | Bandwidth: ${throughputMBs} MB/s (${bandwidthMbps} Mbps) | Note: Staging test bounded to 5-10 MB payload`);
      console.log(`[CONTINUOUS MEMORY SAMPLING] Peak RSS: ${peakRssMb} MB | Peak Heap: ${peakHeapMb} MB (Delta: ${heapDeltaMb} MB) | Peak External: ${peakExternalMb} MB`);
      console.log(`[SCHEDULE SAFETY] Execution margin to next 15-minute monitor run: ${(marginToNextMonitorRunMs / 1000).toFixed(1)}s (Monitor interval: ${monitorScheduleIntervalMinutes}m)`);

      if (marginToNextMonitorRunMs < 0) {
        tierStatus = 'CRITICAL';
        issues.push({
          severity: 'CRITICAL',
          code: 'OVERLAPPING_JOB_RISK',
          message: `Verification duration of ${verDurationMs}ms EXCEEDED 15-minute monitor interval (${monitorScheduleIntervalMinutes}m). Risk of job overlap with next scheduled run! Increase interval or allocate more CPU/bandwidth.`,
        });
      }

      // 2c. Parse expected SHA-256 hash from manifest
      const expectedHash = parseManifestSha256(manifestText);
      if (!expectedHash) {
        tierStatus = 'CRITICAL';
        issues.push({
          severity: 'CRITICAL',
          code: 'CORRUPTED_MANIFEST',
          message: `Manifest '${latestBackup.manifestName}' on S3 is corrupted or missing 64-char hex hash.`,
        });
      }

      // 2d. Verify HMAC signature (Origin Authenticity)
      if (hmacSecret) {
        const isSigValid = verifyManifestSignature(manifestText, sigText, hmacSecret);
        if (!isSigValid) {
          tierStatus = 'CRITICAL';
          issues.push({
            severity: 'CRITICAL',
            code: 'HMAC_SIGNATURE_MISMATCH',
            message: `Origin authenticity verification FAILED for '${latestBackup.manifestName}'! Signature does not match trusted HMAC key. Forged or tampered manifest detected.`,
          });
        } else {
          console.log(`  [MONITOR-S3] HMAC origin authenticity verified: MATCH`);
        }
      } else if (process.env.NODE_ENV === 'production' || process.env.IS_PRODUCTION === 'true') {
        tierStatus = 'CRITICAL';
        issues.push({
          severity: 'CRITICAL',
          code: 'MISSING_HMAC_SECRET',
          message: `BACKUP_HMAC_SECRET is missing. Cannot verify origin authenticity for '${latestBackup.manifestName}' in production.`,
        });
      }

      // 2e. Checksum Parity: Compare stream-computed SHA-256 with manifest hash
      if (expectedHash && computedHash.toLowerCase() !== expectedHash.toLowerCase()) {
        tierStatus = 'CRITICAL';
        issues.push({
          severity: 'CRITICAL',
          code: 'SHA256_PARITY_MISMATCH',
          message: `Cryptographic SHA-256 parity mismatch for '${latestBackup.name}'! Expected '${expectedHash}', but computed '${computedHash}'. Corrupted or tampered dump file!`,
        });
      } else if (expectedHash) {
        console.log(`  [MONITOR-S3] SHA-256 parity verified: ${computedHash} (MATCH)`);
      }

      const hasCryptographicError = issues.some(
        (i) => i.code === 'CORRUPTED_MANIFEST' || i.code === 'HMAC_SIGNATURE_MISMATCH' || i.code === 'SHA256_PARITY_MISMATCH' || i.code === 'MISSING_HMAC_SECRET' || i.code === 'OVERLAPPING_JOB_RISK',
      );

      if (!hasCryptographicError) {
        latestBackup.integrityVerified = true;
        console.log(`[MONITOR-S3] Cryptographic streaming integrity 100% verified for newest backup: ${latestBackup.name}`);
      }
    } catch (verErr) {
      tierStatus = 'CRITICAL';
      const errCode = verErr.code === 'GET_OBJECT_TIMEOUT' ? 'S3_GET_OBJECT_TIMEOUT' : 'STREAM_VERIFICATION_ERROR';
      issues.push({
        severity: 'CRITICAL',
        code: errCode,
        message: `Failed to stream or verify objects for '${latestBackup.name}': ${verErr.message}`,
      });
    }
  }

  // Refuse HEALTHY status if triplet is incomplete or integrity is unverified
  if (!latestBackup || !latestBackup.integrityVerified) {
    if (tierStatus === 'HEALTHY') {
      tierStatus = 'CRITICAL';
    }
  }

  if (incompleteDumps.length > 0 && tierStatus !== 'CRITICAL') {
    tierStatus = 'WARNING';
  }

  return {
    tier,
    status: tierStatus,
    prefix,
    totalObjectsFound: objects.length,
    validBackupsCount: validDumps.length,
    incompleteBackupsCount: incompleteDumps.length,
    latestBackup,
    incompleteDumps,
    issues,
    rpoTargetMinutes,
    rpoWarnMinutes,
  };
}

export async function monitorS3Backups(options = {}) {
  const isDirect = options.isDirect !== false;
  const monitorStartTime = Date.now();
  const webhookUrl = options.webhookUrl || process.env.BACKUP_ALERT_WEBHOOK_URL;
  const tiers = options.tiers || (options.tier ? [options.tier] : (process.env.MONITOR_TIER ? [process.env.MONITOR_TIER] : (process.env.BACKUP_TIER ? [process.env.BACKUP_TIER] : ['hourly', 'daily'])));

  const s3Bucket = options.s3Bucket || process.env.BACKUP_S3_BUCKET || 'ocop-backups';
  const s3Endpoint = options.s3Endpoint || process.env.BACKUP_S3_ENDPOINT || 'localhost';
  const s3Port = options.s3Port ? Number(options.s3Port) : (process.env.BACKUP_S3_PORT ? Number(process.env.BACKUP_S3_PORT) : 9000);
  const s3UseSSL = options.s3UseSSL !== undefined ? options.s3UseSSL : (process.env.BACKUP_S3_USE_SSL === 'true');
  const s3AccessKey = options.s3AccessKey || process.env.BACKUP_S3_ACCESS_KEY || 'minioadmin';
  const s3SecretKey = options.s3SecretKey || process.env.BACKUP_S3_SECRET_KEY || 'minioadmin';
  const monitorScheduleIntervalMinutes = Number(
    options.monitorScheduleIntervalMinutes || options.monitorIntervalMinutes || process.env.MONITOR_SCHEDULE_INTERVAL_MINUTES || 15
  );

  let s3Client = options.s3Client;
  if (!s3Client) {
    s3Client = new MinioClient({
      endPoint: s3Endpoint,
      port: s3Port,
      useSSL: s3UseSSL,
      accessKey: s3AccessKey,
      secretKey: s3SecretKey,
    });
  }

  // Continuous global memory sampler tracking peak RSS, Heap, and External memory across all tiers
  const globalMemTracker = {
    maxRss: 0,
    maxHeapUsed: 0,
    maxExternal: 0,
    sample() {
      const m = process.memoryUsage();
      if (m.rss > this.maxRss) this.maxRss = m.rss;
      if (m.heapUsed > this.maxHeapUsed) this.maxHeapUsed = m.heapUsed;
      if ((m.external || 0) > this.maxExternal) this.maxExternal = m.external;
    },
  };
  globalMemTracker.sample();
  const globalSampler = setInterval(() => globalMemTracker.sample(), 10);
  if (typeof globalSampler.unref === 'function') globalSampler.unref();

  console.log('================================================================');
  console.log('       OCOP INDEPENDENT S3 BACKUP & FRESHNESS MONITOR           ');
  console.log('================================================================');
  console.log(`[CONFIG] Cold Storage Target: ${s3Bucket} (${s3Endpoint}:${s3Port}, TLS: ${s3UseSSL})`);
  console.log(`[CONFIG] Inspected Tiers:     ${tiers.join(', ')}`);
  console.log(`[CONFIG] Monitor Schedule:    Every ${monitorScheduleIntervalMinutes} minutes (Safety window: ${monitorScheduleIntervalMinutes * 60}s)`);
  console.log('================================================================\n');

  const report = {
    timestamp: new Date().toISOString(),
    bucket: s3Bucket,
    overallStatus: 'HEALTHY',
    tiers: {},
    allIssues: [],
    alertsSent: [],
    overallMetrics: null,
  };

  try {
    for (const tier of tiers) {
      const tierResult = await checkS3TierBackup(s3Client, s3Bucket, tier, {
        ...options,
        monitorScheduleIntervalMinutes,
      });
      report.tiers[tier] = tierResult;

      if (tierResult.status === 'CRITICAL') {
        report.overallStatus = 'CRITICAL';
      } else if (tierResult.status === 'WARNING' && report.overallStatus !== 'CRITICAL') {
        report.overallStatus = 'WARNING';
      }

      if (tierResult.issues.length > 0) {
        report.allIssues.push(...tierResult.issues.map((iss) => ({ ...iss, tier })));
      }
    }
  } finally {
    clearInterval(globalSampler);
    globalMemTracker.sample();
  }

  const totalMonitorDurationMs = Date.now() - monitorStartTime;
  const monitorScheduleIntervalMs = monitorScheduleIntervalMinutes * 60 * 1000;
  const totalMarginToNextMonitorRunMs = monitorScheduleIntervalMs - totalMonitorDurationMs;

  report.overallMetrics = {
    inspectedTiers: tiers,
    totalDurationMs: totalMonitorDurationMs,
    monitorScheduleIntervalMinutes,
    marginToNextMonitorRunMs: totalMarginToNextMonitorRunMs,
    marginToNextMonitorRunSeconds: Number((totalMarginToNextMonitorRunMs / 1000).toFixed(1)),
    peakRssMb: Number((globalMemTracker.maxRss / (1024 * 1024)).toFixed(2)),
    peakHeapMb: Number((globalMemTracker.maxHeapUsed / (1024 * 1024)).toFixed(2)),
    peakExternalMb: Number((globalMemTracker.maxExternal / (1024 * 1024)).toFixed(2)),
  };

  if (totalMarginToNextMonitorRunMs < 0) {
    report.overallStatus = 'CRITICAL';
    report.allIssues.push({
      severity: 'CRITICAL',
      tier: 'all',
      code: 'MONITOR_SCHEDULE_OVERRUN',
      message: `Total verification duration for all tiers (${totalMonitorDurationMs}ms) EXCEEDED 15-minute monitor schedule window (${monitorScheduleIntervalMs}ms). Risk of overlapping monitor CronJobs!`,
    });
  }

  // Dispatch alerts if issues found
  if (report.allIssues.length > 0 && webhookUrl) {
    for (const issue of report.allIssues) {
      console.log(`[MONITOR ALERT] Dispatching ${issue.severity} alert: ${issue.message}`);
      const alertRes = await sendAlert(
        webhookUrl,
        `[OCOP BACKUP MONITOR ${issue.severity}] ${issue.code} (Tier: ${issue.tier})`,
        issue.message,
      );
      if (alertRes && alertRes.success === false) {
        console.warn(`[MONITOR ALERT WARNING] Failed to deliver webhook alert to target for issue '${issue.code}': ${alertRes.error || alertRes.status}`);
        report.alertsSent.push({ issue, alertRes, delivered: false });
      } else {
        report.alertsSent.push({ issue, alertRes, delivered: true });
      }
    }
  }

  console.log('\n================================================================');
  console.log(`           MONITOR SUMMARY: ${report.overallStatus}            `);
  console.log('================================================================');
  if (report.overallMetrics) {
    console.log(`- Multi-Tier Total Verification Duration: ${report.overallMetrics.totalDurationMs} ms (Inspected: [${report.overallMetrics.inspectedTiers.join(', ')}])`);
    console.log(`- Monitor Schedule Interval:              ${report.overallMetrics.monitorScheduleIntervalMinutes}m (${report.overallMetrics.monitorScheduleIntervalMinutes * 60}s)`);
    console.log(`- Execution Margin to Next 15m Run:       ${report.overallMetrics.marginToNextMonitorRunSeconds}s`);
    console.log(`- Sampled Continuous Peak Memory:         RSS: ${report.overallMetrics.peakRssMb} MB | Heap: ${report.overallMetrics.peakHeapMb} MB | External: ${report.overallMetrics.peakExternalMb} MB`);
    console.log('----------------------------------------------------------------');
  }
  for (const [tier, res] of Object.entries(report.tiers)) {
    const latestStr = res.latestBackup
      ? `${res.latestBackup.name} (Age: ${res.latestBackup.ageMinutes.toFixed(1)}m, Size: ${res.latestBackup.size} bytes, Integrity: ${res.latestBackup.integrityVerified ? 'VERIFIED' : 'UNVERIFIED'})`
      : 'NONE';
    console.log(`- Tier: ${tier.toUpperCase()}`);
    console.log(`  * Status:            ${res.status}`);
    console.log(`  * Valid Triplets:    ${res.validBackupsCount}`);
    console.log(`  * Incomplete Sets:   ${res.incompleteBackupsCount}`);
    console.log(`  * Latest S3 Backup:  ${latestStr}`);
    if (res.issues.length > 0) {
      for (const iss of res.issues) {
        console.log(`  ! [${iss.severity}] ${iss.code}: ${iss.message}`);
      }
    }
  }
  console.log('================================================================\n');

  if (isDirect && report.overallStatus === 'CRITICAL') {
    process.exit(1);
  }

  return report;
}

// CLI entry point
const isDirectCli = process.argv[1] && (
  process.argv[1].endsWith('monitor-backup-s3.mjs') ||
  process.argv[1].endsWith('monitor-backup-s3')
);

if (isDirectCli) {
  monitorS3Backups({ isDirect: true }).catch((err) => {
    console.error('[MONITOR CRITICAL EXCEPTION]', err.message);
    process.exit(1);
  });
}
