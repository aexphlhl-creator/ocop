import { ConfigService } from '@nestjs/config';

export interface AppRedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db: number;
  tls?: Record<string, never>;
  maxRetriesPerRequest: null;
}

function shouldUseTls(
  protocol: string,
  host: string,
  configService: ConfigService,
) {
  const explicitTls =
    String(configService.get('REDIS_TLS') ?? '').toLowerCase() === 'true';
  return (
    protocol === 'rediss:' ||
    explicitTls ||
    host.endsWith('.upstash.io') ||
    host.includes('.upstash.io')
  );
}

export function createRedisConnectionOptions(
  configService: ConfigService,
): AppRedisConnectionOptions {
  const redisUrl = configService.get<string>('REDIS_URL');

  if (redisUrl) {
    const parsed = new URL(redisUrl);
    const db =
      parsed.pathname.length > 1
        ? Number(parsed.pathname.slice(1))
        : configService.get<number>('REDIS_DB', 0);
    const tls = shouldUseTls(parsed.protocol, parsed.hostname, configService);

    return {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      username: parsed.username
        ? decodeURIComponent(parsed.username)
        : undefined,
      password: parsed.password
        ? decodeURIComponent(parsed.password)
        : undefined,
      db: Number.isNaN(db) ? 0 : db,
      tls: tls ? {} : undefined,
      maxRetriesPerRequest: null,
    };
  }

  const host = configService.get<string>('REDIS_HOST', 'localhost');
  const password = configService.get<string>('REDIS_PASSWORD');
  const tls = shouldUseTls('', host, configService);

  return {
    host,
    port: configService.get<number>('REDIS_PORT', 6379),
    password: password && password.length > 0 ? password : undefined,
    db: configService.get<number>('REDIS_DB', 0),
    tls: tls ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
