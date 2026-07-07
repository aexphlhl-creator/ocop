import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, validateSync } from 'class-validator';

export class EnvironmentVariables {
  @IsNumber()
  @IsOptional()
  @Transform(({ value }) => Number(value))
  PORT = 3000;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  JWT_SECRET: string;

  @IsString()
  JWT_EXPIRES_IN = '1d';

  @IsString()
  JWT_REFRESH_SECRET: string;

  @IsString()
  JWT_REFRESH_EXPIRES_IN = '7d';

  @IsString()
  @IsOptional()
  REDIS_HOST = 'localhost';

  @IsNumber()
  @IsOptional()
  @Transform(({ value }) => Number(value))
  REDIS_PORT = 6379;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD = '';

  @IsString()
  @IsOptional()
  MINIO_ENDPOINT = 'localhost';

  @IsNumber()
  @IsOptional()
  @Transform(({ value }) => Number(value))
  MINIO_PORT = 9000;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  MINIO_USE_SSL = false;

  @IsString()
  MINIO_ACCESS_KEY: string;

  @IsString()
  MINIO_SECRET_KEY: string;

  @IsString()
  MINIO_BUCKET_NAME: string;
}

export function validate(config: Record<string, any>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.toString()}`);
  }
  return validatedConfig;
}
