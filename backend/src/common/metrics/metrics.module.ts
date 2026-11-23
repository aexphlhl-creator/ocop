import { Module, Global } from '@nestjs/common';
import { MetricsInterceptor } from './metrics.interceptor';
import {
  makeCounterProvider,
  makeHistogramProvider,
  getToken,
} from '@willsoto/nestjs-prometheus';

@Global()
@Module({
  providers: [
    MetricsInterceptor,
    makeCounterProvider({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status'],
    }),
    makeHistogramProvider({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.1, 0.3, 0.5, 1, 1.5, 2, 5, 10],
    }),
    makeCounterProvider({
      name: 'http_429_blocked_total',
      help: 'Total number of rate limited requests',
      labelNames: ['route', 'ip'],
    }),
  ],
  exports: [
    MetricsInterceptor,
    getToken('http_requests_total'),
    getToken('http_request_duration_seconds'),
    getToken('http_429_blocked_total'),
  ],
})
export class MetricsModule {}
