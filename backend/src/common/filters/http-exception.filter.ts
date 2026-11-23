import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { httpErrorStatus } from '../interfaces/http-request.interface';

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
        : httpErrorStatus(exception);

    const exceptionResponse: unknown =
      exception instanceof HttpException ? exception.getResponse() : null;

    let message = 'Internal server error';
    let details: string[] | undefined;

    if (exception instanceof HttpException) {
      if (status >= 500) {
        message = 'Internal server error';
      } else {
        message = exception.message;
        if (
          exceptionResponse &&
          typeof exceptionResponse === 'object' &&
          'message' in exceptionResponse
        ) {
          const resMessage = exceptionResponse.message;
          if (Array.isArray(resMessage)) {
            details = resMessage.filter(
              (detail): detail is string => typeof detail === 'string',
            );
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
        message =
          exception instanceof Error
            ? exception.message
            : 'Internal server error';
      }
    }

    let errorCode = 'SYSTEM_500';
    if (status !== 500) {
      errorCode = this.mapErrorCode(request.url, status);
    }

    if (status === 500) {
      this.logger.error(
        `${request.method} ${request.url} - Error: ${
          exception instanceof Error
            ? exception.stack
            : JSON.stringify(exception)
        }`,
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} - Status ${status} - Message: ${message}`,
      );
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
        reqId: request.id || request.headers['x-correlation-id'] || 'UNKNOWN',
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
    if (url.includes('/supply-chain') || url.includes('/traceability'))
      return `TRACEABILITY_${s}`;
    if (url.includes('/blockchain')) return `BLOCKCHAIN_${s}`;
    if (status === 400) return 'VALIDATION_400';
    return `SYSTEM_${s}`;
  }
}
