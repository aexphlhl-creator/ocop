import {
  buildRestrictedMediaBucketPolicy,
  PUBLIC_MEDIA_FOLDERS,
  RESTRICTED_SENSITIVE_FOLDERS,
  MediaService,
} from './media.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

describe('Media Access Control & Bucket Security Policy', () => {
  const bucketName = 'ocop-production-media';

  it('buildRestrictedMediaBucketPolicy grants read access ONLY to designated public prefixes', () => {
    const policy = buildRestrictedMediaBucketPolicy(bucketName);

    expect(policy.Statement).toBeDefined();
    expect(policy.Statement.length).toBe(1);

    const statement = policy.Statement[0];
    expect(statement.Effect).toBe('Allow');
    expect(statement.Action).toEqual(['s3:GetObject']);

    // Must strictly match public folders only
    const expectedResources = PUBLIC_MEDIA_FOLDERS.map(
      (folder) => `arn:aws:s3:::${bucketName}/${folder}/*`,
    );
    expect(statement.Resource).toEqual(expectedResources);
  });

  it('buildRestrictedMediaBucketPolicy NEVER contains full bucket wildcard /*', () => {
    const policy = buildRestrictedMediaBucketPolicy(bucketName);
    const statement = policy.Statement[0];

    const hasWildcardAll = statement.Resource.some(
      (r: string) => r === `arn:aws:s3:::${bucketName}/*` || r === `arn:aws:s3:::${bucketName}`,
    );
    expect(hasWildcardAll).toBe(false);
  });

  it('buildRestrictedMediaBucketPolicy EXCLUDES sensitive and internal prefixes (certificates, supply-chain, shipments, documents)', () => {
    const policy = buildRestrictedMediaBucketPolicy(bucketName);
    const statement = policy.Statement[0];

    for (const sensitiveFolder of RESTRICTED_SENSITIVE_FOLDERS) {
      const exposesSensitiveFolder = statement.Resource.some((r: string) =>
        r.includes(`/${sensitiveFolder}/`),
      );
      expect(exposesSensitiveFolder).toBe(false);
    }
  });

  it('MediaService applies the restricted policy during onModuleInit()', async () => {
    const setBucketPolicyMock = jest.fn().mockResolvedValue(true);
    const minioClientMock = {
      bucketExists: jest.fn().mockResolvedValue(true),
      makeBucket: jest.fn(),
      setBucketPolicy: setBucketPolicyMock,
    };

    const configServiceMock = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'DEMO_MODE') return false;
        if (key === 'MINIO_BUCKET') return bucketName;
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    const service = module.get<MediaService>(MediaService);
    (service as any).minioClient = minioClientMock;

    await service.onModuleInit();

    expect(setBucketPolicyMock).toHaveBeenCalledTimes(1);
    const passedPolicyJson = setBucketPolicyMock.mock.calls[0][1];
    const parsedPolicy = JSON.parse(passedPolicyJson);

    // Verify parsed policy is prefix-restricted
    expect(parsedPolicy.Statement[0].Resource).not.toContain(
      `arn:aws:s3:::${bucketName}/*`,
    );
    expect(parsedPolicy.Statement[0].Resource).toEqual(
      expect.arrayContaining([
        `arn:aws:s3:::${bucketName}/products/*`,
        `arn:aws:s3:::${bucketName}/avatars/*`,
      ]),
    );

    // Verify isPublicFolder helper
    expect(service.isPublicFolder('products')).toBe(true);
    expect(service.isPublicFolder('avatars')).toBe(true);
    expect(service.isPublicFolder('certificates')).toBe(false);
    expect(service.isPublicFolder('supply-chain')).toBe(false);
    expect(service.isPublicFolder('shipments')).toBe(false);
  });
});
