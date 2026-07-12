import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : (exception as any)?.status || HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse: any =
      exception instanceof HttpException ? exception.getResponse() : null;

    let message = 'Internal server error';
    let details: any = undefined;

    if (exception instanceof HttpException) {
      if (status >= 500) {
        message = 'Internal server error';
      } else {
        message = exception.message;
        if (exceptionResponse && typeof exceptionResponse === 'object') {
          const resMessage = exceptionResponse.message;
          if (Array.isArray(resMessage)) {
            details = resMessage;
            message = 'Validation failed';
          } else if (typeof resMessage === 'string') {
            message = resMessage;
          }
        }
      }
    } else {
      if (status === 413) {
        message = 'Payload Too Large';
      } else if (status >= 500) {
        message = 'Internal server error';
      } else {
        message = (exception as any)?.message || 'Internal server error';
      }
    }

    let errorCode = 'SYSTEM_500';
    if (status !== HttpStatus.INTERNAL_SERVER_ERROR) {
       errorCode = this.mapErrorCode(request.url, status);
    }

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} - Error: ${
          exception instanceof Error ? exception.stack : JSON.stringify(exception)
        }`,
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} - Status ${status} - Message: ${message}`);
    }

    response.status(status).json({
      success: false,
      error: {
        statusCode: status,
        errorCode,
        message,
        details,
        timestamp: new Date().toISOString(),
        path: request.url,
        reqId: (request as any).id || request.headers['x-correlation-id'] || 'UNKNOWN',
      },
    });
  }

  private mapErrorCode(url: string, status: number): string {
    const s = String(status);
    if (url.includes('/auth/')) return `AUTH_${s}`;
    if (url.includes('/businesses')) return `BUSINESS_${s}`;
    if (url.includes('/products')) return `PRODUCT_${s}`;
    if (url.includes('/inventory')) return `INVENTORY_${s}`;
    if (url.includes('/orders')) return `ORDER_${s}`;
    if (url.includes('/certificates')) return `CERTIFICATE_${s}`;
    if (url.includes('/supply-chain') || url.includes('/traceability')) return `TRACEABILITY_${s}`;
    if (url.includes('/blockchain')) return `BLOCKCHAIN_${s}`;
    if (status === 400) return 'VALIDATION_400';
    return `SYSTEM_${s}`;
  }
}
