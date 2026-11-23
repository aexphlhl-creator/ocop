import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export class EnvironmentVariables {
  @IsString()
  @IsOptional()
  NODE_ENV: string = 'development';

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  DEMO_MODE = false;

  @IsString()
  @IsOptional()
  ALLOWED_ORIGINS?: string;

  @IsString()
  @IsOptional()
  CORS_ORIGIN?: string;

  @IsNumber()
  @IsOptional()
  @Transform(({ value }) => Number(value))
  PORT = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @IsString()
  JWT_EXPIRES_IN = '1d';

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_SECRET: string;

  @IsString()
  JWT_REFRESH_EXPIRES_IN = '7d';

  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  REDIS_TLS = false;

  @IsString()
  @IsOptional()
  REDIS_HOST?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(65535)
  @Transform(({ value }) => Number(value))
  REDIS_PORT = 6379;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD = '';

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Transform(({ value }) => Number(value))
  REDIS_DB = 0;

  @IsString()
  @IsOptional()
  MINIO_ENDPOINT?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(65535)
  @Transform(({ value }) => Number(value))
  MINIO_PORT = 9000;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  MINIO_USE_SSL = false;

  @IsString()
  @IsOptional()
  MINIO_ACCESS_KEY?: string;

  @IsString()
  @IsOptional()
  MINIO_SECRET_KEY?: string;

  @IsString()
  @IsOptional()
  MINIO_BUCKET?: string;

  @IsString()
  @IsOptional()
  MINIO_BUCKET_NAME?: string;

  @IsString()
  @IsOptional()
  MINIO_PUBLIC_URL?: string;

  @IsString()
  @IsOptional()
  POLYGON_RPC_URL?: string;

  @IsString()
  @IsOptional()
  POLYGON_PRIVATE_KEY?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Transform(({ value }) => Number(value))
  POLYGON_CHAIN_ID = 80002;

  @IsString()
  @IsOptional()
  CONTRACT_ADDRESS?: string;

  @IsString()
  @IsOptional()
  VNPAY_TMN_CODE?: string;

  @IsString()
  @IsOptional()
  VNPAY_HASH_SECRET?: string;

  @IsString()
  @IsOptional()
  VNPAY_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';

  @IsString()
  @IsOptional()
  VNPAY_API_URL =
    'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction';

  @IsString()
  @IsOptional()
  VNPAY_RETURN_URL = 'http://localhost:3000/checkout/callback';

  @IsString()
  @IsOptional()
  VNPAY_SERVER_IP = '127.0.0.1';

  @IsString()
  @IsOptional()
  VNPAY_REFUND_CREATED_BY = 'OCOP_SYSTEM';

  @IsNumber()
  @IsOptional()
  @Min(5)
  @Max(60)
  @Transform(({ value }) => Number(value))
  VNPAY_PAYMENT_TIMEOUT_MINUTES = 15;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(60)
  @Transform(({ value }) => Number(value))
  VNPAY_RECONCILIATION_GRACE_MINUTES = 5;

  @IsNumber()
  @IsOptional()
  @Min(1000)
  @Max(30000)
  @Transform(({ value }) => Number(value))
  VNPAY_API_TIMEOUT_MS = 5000;

  @IsString()
  @IsOptional()
  CARRIER_WEBHOOK_SECRETS?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.toString()}`);
  }

  const corsOrigins =
    validatedConfig.ALLOWED_ORIGINS ?? validatedConfig.CORS_ORIGIN;
  if (
    validatedConfig.NODE_ENV === 'production' &&
    (!corsOrigins || corsOrigins.trim().length === 0)
  ) {
    throw new Error(
      'Environment validation failed: ALLOWED_ORIGINS or CORS_ORIGIN is required in production',
    );
  }

  if (corsOrigins) {
    validatedConfig.ALLOWED_ORIGINS = corsOrigins;
    validatedConfig.CORS_ORIGIN = corsOrigins;
  }

  if (validatedConfig.REDIS_URL) {
    validateRedisUrl(validatedConfig.REDIS_URL);
  } else if (
    !validatedConfig.REDIS_HOST ||
    validatedConfig.REDIS_HOST.trim().length === 0
  ) {
    throw new Error(
      'Environment validation failed: REDIS_URL or REDIS_HOST is required',
    );
  }

  const isDemoMode = validatedConfig.DEMO_MODE === true;
  const minioBucket = normalizeOptionalEnv(
    config.MINIO_BUCKET ?? config.MINIO_BUCKET_NAME,
  );
  if (!isDemoMode) {
    validateMinioConfig(config, minioBucket);
  }

  if (minioBucket) {
    validatedConfig.MINIO_BUCKET = minioBucket;
    validatedConfig.MINIO_BUCKET_NAME = minioBucket;
  }
  validateBlockchainConfig(config);
  validateVnpayConfig(validatedConfig);
  validateCarrierWebhookSecrets(validatedConfig.CARRIER_WEBHOOK_SECRETS);
  return validatedConfig;
}

function validateCarrierWebhookSecrets(raw?: string) {
  if (!raw) return;
  let values: unknown;
  try {
    values = JSON.parse(raw);
  } catch {
    throw new Error(
      'Environment validation failed: CARRIER_WEBHOOK_SECRETS must be valid JSON',
    );
  }
  if (!values || Array.isArray(values) || typeof values !== 'object') {
    throw new Error(
      'Environment validation failed: CARRIER_WEBHOOK_SECRETS must be a JSON object',
    );
  }
  for (const [provider, secret] of Object.entries(values)) {
    if (
      !/^[A-Z0-9_-]{2,50}$/.test(provider) ||
      typeof secret !== 'string' ||
      secret.length < 32
    ) {
      throw new Error(
        'Environment validation failed: every carrier webhook provider must use an uppercase code and a secret of at least 32 characters',
      );
    }
  }
}

function validateVnpayConfig(config: EnvironmentVariables) {
  const requiredInProduction = [
    ['VNPAY_TMN_CODE', config.VNPAY_TMN_CODE],
    ['VNPAY_HASH_SECRET', config.VNPAY_HASH_SECRET],
  ];
  const missing = requiredInProduction
    .filter(([, value]) => !value || String(value).trim().length === 0)
    .map(([key]) => key);

  if (config.NODE_ENV === 'production' && missing.length > 0) {
    throw new Error(
      `Environment validation failed: missing VNPay env ${missing.join(', ')}`,
    );
  }

  for (const [key, value] of [
    ['VNPAY_URL', config.VNPAY_URL],
    ['VNPAY_API_URL', config.VNPAY_API_URL],
    ['VNPAY_RETURN_URL', config.VNPAY_RETURN_URL],
  ]) {
    try {
      const parsed = new URL(String(value));
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch {
      throw new Error(
        `Environment validation failed: ${key} must be an http(s) URL`,
      );
    }
  }
}

function validateMinioConfig(
  config: Record<string, unknown>,
  minioBucket: unknown,
) {
  const required = [
    ['MINIO_ENDPOINT', config.MINIO_ENDPOINT],
    ['MINIO_ACCESS_KEY', config.MINIO_ACCESS_KEY],
    ['MINIO_SECRET_KEY', config.MINIO_SECRET_KEY],
    ['MINIO_BUCKET', minioBucket],
  ];

  const missing = required
    .filter(([, value]) => !normalizeOptionalEnv(value))
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Environment validation failed: missing MinIO env ${missing.join(', ')}`,
    );
  }
}

function validateBlockchainConfig(config: Record<string, unknown>) {
  const isDemoMode = config.DEMO_MODE === true || config.DEMO_MODE === 'true';
  if (isDemoMode) {
    return;
  }

  const rpcUrl = normalizeOptionalEnv(config.POLYGON_RPC_URL);
  const privateKey = normalizeOptionalEnv(config.POLYGON_PRIVATE_KEY);
  const chainId = normalizeOptionalEnv(config.POLYGON_CHAIN_ID);
  const contractAddress = normalizeOptionalEnv(config.CONTRACT_ADDRESS);
  const hasAnyBlockchainConfig = Boolean(
    rpcUrl || privateKey || chainId || contractAddress,
  );

  if (!hasAnyBlockchainConfig) {
    if (config.NODE_ENV === 'production') {
      throw new Error(
        'Environment validation failed: Blockchain config (POLYGON_*) is required in production',
      );
    }
    return;
  }

  const missing = [
    ['POLYGON_RPC_URL', rpcUrl],
    ['POLYGON_PRIVATE_KEY', privateKey],
    ['POLYGON_CHAIN_ID', chainId],
    ['CONTRACT_ADDRESS', contractAddress],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Environment validation failed: missing blockchain env ${missing.join(', ')}`,
    );
  }

  if (!/^https?:\/\//i.test(rpcUrl)) {
    throw new Error(
      'Environment validation failed: POLYGON_RPC_URL must be an http(s) URL',
    );
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error(
      'Environment validation failed: POLYGON_PRIVATE_KEY must be a 32-byte hex private key',
    );
  }

  if (!/^\d+$/.test(chainId) || Number(chainId) <= 0) {
    throw new Error(
      'Environment validation failed: POLYGON_CHAIN_ID must be a positive number',
    );
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) {
    throw new Error(
      'Environment validation failed: CONTRACT_ADDRESS must be an Ethereum address',
    );
  }
}

function normalizeOptionalEnv(value: unknown) {
  if (value === undefined || value === null) {
    return '';
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value).trim();
  }
  throw new Error(
    'Environment validation failed: environment values must be strings, numbers or booleans',
  );
}

function validateRedisUrl(redisUrl: string) {
  try {
    const parsed = new URL(redisUrl);
    if (!['redis:', 'rediss:'].includes(parsed.protocol)) {
      throw new Error('Invalid protocol');
    }
  } catch {
    throw new Error(
      'Environment validation failed: REDIS_URL must be a redis:// or rediss:// URL',
    );
  }
}
