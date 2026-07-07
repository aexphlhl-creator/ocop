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
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse: any =
      exception instanceof HttpException ? exception.getResponse() : null;

    let message = 'Internal server error';
    let details: any = undefined;

    if (exception instanceof HttpException) {
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
    } else if (exception instanceof Error) {
      message = exception.message;
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
        message,
        details,
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    });
  }
}
