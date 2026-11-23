import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response, Request } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientValidationError)
export class PrismaClientExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('PrismaClientExceptionFilter');

  catch(
    exception:
      Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientValidationError,
    host: ArgumentsHost,
  ) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: string | undefined;

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Prisma error codes documentation: https://www.prisma.io/docs/reference/api-reference/error-reference
      switch (exception.code) {
        case 'P2002': // Unique constraint failed
          status = HttpStatus.CONFLICT;
          message = 'Dữ liệu đã tồn tại trong hệ thống.';
          details =
            typeof exception.meta?.target === 'string'
              ? `Trùng lặp trường: ${exception.meta.target}`
              : Array.isArray(exception.meta?.target)
                ? `Trùng lặp trường: ${exception.meta.target.filter((value): value is string => typeof value === 'string').join(', ')}`
                : undefined;
          break;
        case 'P2025': // Record not found
          status = HttpStatus.NOT_FOUND;
          message = 'Không tìm thấy dữ liệu yêu cầu.';
          break;
        case 'P2003': // Foreign key constraint failed
          status = HttpStatus.BAD_REQUEST;
          message = 'Dữ liệu tham chiếu không hợp lệ.';
          break;
        case 'P2014': // The change you are trying to make would violate the required relation
        case 'P2011': // Null constraint violation
          status = HttpStatus.BAD_REQUEST;
          message = 'Lỗi dữ liệu liên kết hoặc giá trị bị bỏ trống.';
          break;
        default:
          // For other known errors, keep as 500 but don't expose error details
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          message = 'Đã có lỗi xảy ra trong quá trình xử lý cơ sở dữ liệu.';
          break;
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      // Invalid arguments / types provided to Prisma
      status = HttpStatus.BAD_REQUEST;
      message = 'Dữ liệu đầu vào không hợp lệ.';
      // Do not expose exception.message directly because it contains schema details!
      this.logger.warn(
        `${request.method} ${request.url} - Prisma Validation Error`,
      );
    }

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} - Prisma Error: ${exception.message}`,
        exception.stack,
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
        errorCode: `DATABASE_${status}`,
        message,
        details,
        timestamp: new Date().toISOString(),
        path: request.url,
        reqId: request.id || request.headers['x-correlation-id'] || 'UNKNOWN',
      },
    });
  }
}
