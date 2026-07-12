import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

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
  @IsNotEmpty()
  MINIO_ENDPOINT: string;

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
  @IsNotEmpty()
  MINIO_ACCESS_KEY: string;

  @IsString()
  @IsNotEmpty()
  MINIO_SECRET_KEY: string;

  @IsString()
  @IsOptional()
  MINIO_BUCKET?: string;

  @IsString()
  @IsOptional()
  MINIO_BUCKET_NAME?: string;

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
}

export function validate(config: Record<string, any>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.toString()}`);
  }

  const corsOrigins = validatedConfig.ALLOWED_ORIGINS ?? validatedConfig.CORS_ORIGIN;
  if (validatedConfig.NODE_ENV === 'production' && (!corsOrigins || corsOrigins.trim().length === 0)) {
    throw new Error('Environment validation failed: ALLOWED_ORIGINS or CORS_ORIGIN is required in production');
  }

  if (corsOrigins) {
    validatedConfig.ALLOWED_ORIGINS = corsOrigins;
    validatedConfig.CORS_ORIGIN = corsOrigins;
  }

  if (validatedConfig.REDIS_URL) {
    validateRedisUrl(validatedConfig.REDIS_URL);
  } else if (!validatedConfig.REDIS_HOST || validatedConfig.REDIS_HOST.trim().length === 0) {
    throw new Error('Environment validation failed: REDIS_URL or REDIS_HOST is required');
  }

  const minioBucket = config.MINIO_BUCKET ?? config.MINIO_BUCKET_NAME;
  if (!minioBucket || String(minioBucket).trim().length === 0) {
    throw new Error('Environment validation failed: MINIO_BUCKET is required');
  }

  validatedConfig.MINIO_BUCKET = minioBucket;
  validatedConfig.MINIO_BUCKET_NAME = minioBucket;
  validateBlockchainConfig(config);
  return validatedConfig;
}

function validateBlockchainConfig(config: Record<string, any>) {
  const isDemoMode = config.DEMO_MODE === true || config.DEMO_MODE === 'true';
  if (isDemoMode) {
    return;
  }

  const rpcUrl = normalizeOptionalEnv(config.POLYGON_RPC_URL);
  const privateKey = normalizeOptionalEnv(config.POLYGON_PRIVATE_KEY);
  const chainId = normalizeOptionalEnv(config.POLYGON_CHAIN_ID);
  const contractAddress = normalizeOptionalEnv(config.CONTRACT_ADDRESS);
  const hasAnyBlockchainConfig = Boolean(rpcUrl || privateKey || chainId || contractAddress);

  if (!hasAnyBlockchainConfig) {
    if (config.NODE_ENV === 'production') {
      throw new Error('Environment validation failed: Blockchain config (POLYGON_*) is required in production');
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
    throw new Error(`Environment validation failed: missing blockchain env ${missing.join(', ')}`);
  }

  if (!/^https?:\/\//i.test(rpcUrl as string)) {
    throw new Error('Environment validation failed: POLYGON_RPC_URL must be an http(s) URL');
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey as string)) {
    throw new Error('Environment validation failed: POLYGON_PRIVATE_KEY must be a 32-byte hex private key');
  }

  if (!/^\d+$/.test(chainId as string) || Number(chainId) <= 0) {
    throw new Error('Environment validation failed: POLYGON_CHAIN_ID must be a positive number');
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(contractAddress as string)) {
    throw new Error('Environment validation failed: CONTRACT_ADDRESS must be an Ethereum address');
  }
}

function normalizeOptionalEnv(value: unknown) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
}

function validateRedisUrl(redisUrl: string) {
  try {
    const parsed = new URL(redisUrl);
    if (!['redis:', 'rediss:'].includes(parsed.protocol)) {
      throw new Error('Invalid protocol');
    }
  } catch {
    throw new Error('Environment validation failed: REDIS_URL must be a redis:// or rediss:// URL');
  }
}
