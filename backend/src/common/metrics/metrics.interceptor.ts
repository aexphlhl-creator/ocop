import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';
import { Request, Response } from 'express';
import { httpErrorStatus } from '../interfaces/http-request.interface';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(
    @InjectMetric('http_requests_total')
    private readonly requestCount: Counter<string>,
    @InjectMetric('http_request_duration_seconds')
    private readonly requestDuration: Histogram<string>,
  ) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const method = req.method;
    // Lấy original url nhưng bỏ đi các path parameter cụ thể (như uuid) để tránh bùng nổ cardinality
    const matchedRoute: unknown = req.route;
    const route =
      typeof matchedRoute === 'object' &&
      matchedRoute !== null &&
      'path' in matchedRoute &&
      typeof matchedRoute.path === 'string'
        ? matchedRoute.path
        : req.url.split('?')[0];
    const endTimer = this.requestDuration.startTimer({ method, route });

    return next.handle().pipe(
      tap(() => {
        this.requestCount.inc({ method, route, status: res.statusCode });
        endTimer({ status: res.statusCode });
      }),
      catchError((err: unknown) => {
        const status = httpErrorStatus(err);
        this.requestCount.inc({ method, route, status });
        endTimer({ status });
        throw err;
      }),
    );
  }
}
