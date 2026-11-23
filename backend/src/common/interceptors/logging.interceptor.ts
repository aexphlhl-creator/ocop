import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method;
    const url = request.url;
    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse<Response>();
        const statusCode = response.statusCode;
        const delay = Date.now() - now;

        // Redact sensitive query parameters from URL
        const sensitiveKeys = [
          'password',
          'passwordhash',
          'accesstoken',
          'refreshtoken',
          'authorization',
          'cookie',
          'jwt',
          'token',
          'apikey',
          'clientsecret',
          'privatekey',
          'secret',
        ];
        let safeUrl = url;
        if (safeUrl.includes('?')) {
          const urlParts = safeUrl.split('?');
          const queryParams = urlParts[1].split('&');
          const safeParams = queryParams.map((param: string) => {
            const [key] = param.split('=');
            if (key && sensitiveKeys.includes(key.toLowerCase())) {
              return `${key}=[REDACTED]`;
            }
            return param;
          });
          safeUrl = `${urlParts[0]}?${safeParams.join('&')}`;
        }

        this.logger.log(`${method} ${safeUrl} ${statusCode} - ${delay}ms`);
      }),
    );
  }
}
