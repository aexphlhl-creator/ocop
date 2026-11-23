/**
 * OCOP Staging Media Disaster Recovery Drill
 * Validates object storage backup and restore for MinIO / S3 assets
 * Reconciles byte-for-byte SHA-256 checksums, measures recovery time (RTO),
 * and verifies strict fail-closed resource cleanup.
 */

import { Client } from 'minio';
import { createHash, randomBytes } from 'crypto';
import { mkdir, writeFile, readFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function computeSha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function runMediaDrill() {
  console.log('[MEDIA-DRILL] Starting isolated MinIO/S3 Media Backup & Restore Drill...');

  const drillId = randomBytes(4).toString('hex');
  const srcBucket = `ocop-drill-media-src-${drillId}`;
  const dstBucket = `ocop-drill-media-dst-${drillId}`;
  const tempDir = join(__dirname, `.media-drill-temp-${drillId}`);

  const minioClient = new Client({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  });

  let drillSuccess = false;
  const orphanedResources = [];

  try {
    // 1. Create isolated source bucket
    console.log(`[MEDIA-DRILL STEP 1] Creating isolated source bucket: ${srcBucket}...`);
    await minioClient.makeBucket(srcBucket, 'us-east-1');

    // 2. Prepare representative media assets with valid MIME signatures
    console.log('[MEDIA-DRILL STEP 2] Seeding representative OCOP media fixtures...');

    // JPEG fixture: Products
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const jpegBody = randomBytes(128 * 1024); // 128 KB
    const jpegBuffer = Buffer.concat([jpegHeader, jpegBody]);

    // PDF fixture: Certificates
    const pdfHeader = Buffer.from('%PDF-1.5\n% drill certificate file\n');
    const pdfBody = randomBytes(96 * 1024); // 96 KB
    const pdfBuffer = Buffer.concat([pdfHeader, pdfBody]);

    // PNG fixture: Traceability QR Codes
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const pngBody = randomBytes(48 * 1024); // 48 KB
    const pngBuffer = Buffer.concat([pngHeader, pngBody]);

    // WebP fixture: Seller Avatars
    const webpHeader = Buffer.from('RIFF....WEBPVP8 ', 'ascii');
    const webpBody = randomBytes(32 * 1024); // 32 KB
    const webpBuffer = Buffer.concat([webpHeader, webpBody]);

    const fixtures = [
      { key: 'products/tra-shan-tuyet-drill.jpg', buffer: jpegBuffer, mime: 'image/jpeg' },
      { key: 'certificates/vietgap-organic-drill.pdf', buffer: pdfBuffer, mime: 'application/pdf' },
      { key: 'shipments/qr-traceability-batch-101.png', buffer: pngBuffer, mime: 'image/png' },
      { key: 'avatars/seller-coop-logo.webp', buffer: webpBuffer, mime: 'image/webp' },
    ];

    const sourceManifest = [];
    for (const fixture of fixtures) {
      const checksum = computeSha256(fixture.buffer);
      await minioClient.putObject(srcBucket, fixture.key, fixture.buffer, fixture.buffer.length, {
        'Content-Type': fixture.mime,
      });
      sourceManifest.push({
        key: fixture.key,
        size: fixture.buffer.length,
        checksum,
      });
      console.log(`  Uploaded ${fixture.key.padEnd(42)} | Size: ${String(fixture.buffer.length).padStart(7)} bytes | SHA-256: ${checksum.slice(0, 16)}...`);
    }

    // 3. Backup objects to local staging directory
    console.log(`\n[MEDIA-DRILL STEP 3] Extracting backup snapshot to ${tempDir}...`);
    await mkdir(tempDir, { recursive: true });

    const backupFiles = [];
    for (const item of sourceManifest) {
      const stream = await minioClient.getObject(srcBucket, item.key);
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks);
      const safeFilename = item.key.replace(/\//g, '_');
      const backupPath = join(tempDir, safeFilename);
      await writeFile(backupPath, data);
      backupFiles.push({ key: item.key, backupPath, size: data.length });
    }
    console.log(`[MEDIA-DRILL STEP 3] Backup snapshot completed: ${backupFiles.length} files saved.`);

    // 4. End-to-End Recovery Procedure & Timing
    console.log(`\n[MEDIA-DRILL STEP 4] Initiating complete Disaster Recovery process for target bucket: ${dstBucket}...`);
    const recoveryStart = performance.now();

    // 4a. Provision and configure target bucket (with prefix-restricted public read policy, excluding certificates/documents)
    await minioClient.makeBucket(dstBucket, 'us-east-1');
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'PublicMediaReadOnlyAccess',
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: [
            `arn:aws:s3:::${dstBucket}/products/*`,
            `arn:aws:s3:::${dstBucket}/avatars/*`,
            `arn:aws:s3:::${dstBucket}/news/*`,
            `arn:aws:s3:::${dstBucket}/events/*`,
          ],
        },
      ],
    };
    await minioClient.setBucketPolicy(dstBucket, JSON.stringify(policy));

    // 4b. Restore all backup files into destination bucket
    console.log('[MEDIA-DRILL STEP 4b] Uploading media backup snapshots into target bucket...');
    const uploadStart = performance.now();
    for (const backup of backupFiles) {
      const restoredBuffer = await readFile(backup.backupPath);
      await minioClient.putObject(dstBucket, backup.key, restoredBuffer, restoredBuffer.length);
    }
    const uploadEnd = performance.now();
    const fixtureUploadTimeMs = Math.round(uploadEnd - uploadStart);

    // 4c. Verify application readability: Read back all media streams from target bucket
    console.log('[MEDIA-DRILL STEP 4c] Verifying media readability from application layer...');
    for (const original of sourceManifest) {
      const stream = await minioClient.getObject(dstBucket, original.key);
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks);
      if (data.length !== original.size) {
        throw new Error(`Read verification failed for ${original.key}: incomplete buffer received`);
      }
    }

    // 4d. Verify storage subsystem health check endpoint
    console.log('[MEDIA-DRILL STEP 4d] Verifying storage subsystem readiness via MinIO health check...');
    const healthEndpoint = `http://${process.env.MINIO_ENDPOINT || 'localhost'}:${process.env.MINIO_PORT || 9000}/minio/health/live`;
    const healthRes = await fetch(healthEndpoint);
    if (healthRes.status !== 200) {
      throw new Error(`MinIO health check endpoint returned status ${healthRes.status}, expected 200`);
    }

    const recoveryEnd = performance.now();
    const endToEndRecoveryTimeMs = Math.round(recoveryEnd - recoveryStart);

    // 5. Audit and reconcile restored objects byte-by-byte
    console.log('\n[MEDIA-DRILL STEP 5] Reconciling restored objects byte-by-byte via SHA-256 checksums...');
    let totalBytesVerified = 0;
    for (const original of sourceManifest) {
      const stream = await minioClient.getObject(dstBucket, original.key);
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const restoredData = Buffer.concat(chunks);
      const restoredChecksum = computeSha256(restoredData);

      if (restoredChecksum !== original.checksum) {
        throw new Error(
          `Checksum mismatch on restored object '${original.key}'!\nExpected: ${original.checksum}\nActual:   ${restoredChecksum}`,
        );
      }
      if (restoredData.length !== original.size) {
        throw new Error(
          `Size mismatch on restored object '${original.key}'!\nExpected: ${original.size}\nActual:   ${restoredData.length}`,
        );
      }

      totalBytesVerified += restoredData.length;
      console.log(
        `  [100% BYTE MATCH] ${original.key.padEnd(42)} | Restored Size: ${String(restoredData.length).padStart(7)} bytes | SHA-256: ${restoredChecksum.slice(0, 16)}...`,
      );
    }

    console.log(`\n[MEDIA-DRILL SUMMARY] Media Disaster Recovery Verification Report:`);
    console.log(`  - Scope of Test Data: ${sourceManifest.length} fixtures (${totalBytesVerified} bytes / ~304 KB total).`);
    console.log(`  - Target Bucket Fixture Upload Time: ${fixtureUploadTimeMs} ms (Chỉ là thời gian đẩy 4 tệp vào bucket).`);
    console.log(`  - End-to-End Recovery Duration: ${endToEndRecoveryTimeMs} ms (Tính từ khởi tạo bucket, cấu hình policy, nạp file, đọc xác minh stream và kiểm tra health check đạt).`);
    console.log(`  - Byte Fidelity: 100% verified via cryptographic SHA-256 parity.`);
    console.log(`\n[MEASUREMENT LIMITATIONS & PRODUCTION TARGETS]:`);
    console.log(`  * GIỚI HẠN PHÉP ĐO: Phép đo được thực hiện trên Staging cục bộ (loopback) với dataset mẫu 4 tệp (~304 KB).`);
    console.log(`    Tuyệt đối KHÔNG coi con số ${endToEndRecoveryTimeMs} ms này là RTO của môi trường Production thật.`);
    console.log(`  * RTO Mục tiêu Vận hành Production: <= 2 giờ (Chỉ tiêu phục hồi toàn bộ kho media khi có thảm họa).`);
    console.log(`  * RPO Mục tiêu Vận hành Production: <= 1 giờ (Chỉ tiêu tần suất đồng bộ snapshot media ngoại vi).`);

    drillSuccess = true;
  } finally {
    // 6. Cleanup isolated buckets and temporary directory
    console.log('\n[MEDIA-DRILL CLEANUP] Destroying drill buckets and temporary files...');
    let cleanupFailed = false;

    if (process.env.SIMULATE_MEDIA_CLEANUP_FAILURE === 'true') {
      console.error('[MEDIA-DRILL SIMULATION] Triggering simulated cleanup failure for source bucket.');
      cleanupFailed = true;
      orphanedResources.push(`Bucket: ${srcBucket} (Simulated Cleanup Failure)`);
    } else {
      try {
        if (await minioClient.bucketExists(srcBucket)) {
          // Empty bucket before removal
          const objectsList = [];
          const listStream = minioClient.listObjects(srcBucket, '', true);
          for await (const obj of listStream) {
            objectsList.push(obj.name);
          }
          if (objectsList.length > 0) {
            await minioClient.removeObjects(srcBucket, objectsList);
          }
          await minioClient.removeBucket(srcBucket);
          console.log(`[MEDIA-DRILL CLEANUP] Dropped source bucket: ${srcBucket}`);
        }
      } catch (err) {
        console.error(`[MEDIA-DRILL CLEANUP ERROR] Failed to drop source bucket ${srcBucket}: ${err.message}`);
        cleanupFailed = true;
        orphanedResources.push(`Bucket: ${srcBucket}`);
      }
    }

    try {
      if (await minioClient.bucketExists(dstBucket)) {
        const objectsList = [];
        const listStream = minioClient.listObjects(dstBucket, '', true);
        for await (const obj of listStream) {
          objectsList.push(obj.name);
        }
        if (objectsList.length > 0) {
          await minioClient.removeObjects(dstBucket, objectsList);
        }
        await minioClient.removeBucket(dstBucket);
        console.log(`[MEDIA-DRILL CLEANUP] Dropped destination bucket: ${dstBucket}`);
      }
    } catch (err) {
      console.error(`[MEDIA-DRILL CLEANUP ERROR] Failed to drop destination bucket ${dstBucket}: ${err.message}`);
      cleanupFailed = true;
      orphanedResources.push(`Bucket: ${dstBucket}`);
    }

    try {
      if (existsSync(tempDir)) {
        await rm(tempDir, { recursive: true, force: true });
        console.log(`[MEDIA-DRILL CLEANUP] Removed temporary directory: ${tempDir}`);
      }
    } catch (err) {
      console.error(`[MEDIA-DRILL CLEANUP ERROR] Failed to remove temp dir ${tempDir}: ${err.message}`);
      cleanupFailed = true;
      orphanedResources.push(`Directory: ${tempDir}`);
    }

    if (cleanupFailed) {
      console.error('\n[MEDIA-DRILL CRITICAL WARNING] Cleanup was NOT fully successful! Orphaned resources remaining:');
      for (const res of orphanedResources) {
        console.error(`  - ${res}`);
      }
      drillSuccess = false;
    }
  }

  if (drillSuccess) {
    console.log('\n[MEDIA-DRILL] SUCCESS: Media Disaster Recovery Drill verified with zero orphaned resources.\n');
    process.exit(0);
  } else {
    console.error('\n[MEDIA-DRILL] FAILED: Drill did not complete cleanly or cleanup encountered errors.\n');
    process.exit(1);
  }
}

runMediaDrill().catch((err) => {
  console.error('[MEDIA-DRILL FATAL ERROR]', err);
  process.exit(1);
});
