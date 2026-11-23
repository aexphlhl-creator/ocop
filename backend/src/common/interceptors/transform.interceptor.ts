import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  ApiResponse,
  PaginatedResponse,
} from '../interfaces/api-response.interface';

function isPagination(data: unknown): data is PaginatedResponse<unknown> {
  if (
    !data ||
    typeof data !== 'object' ||
    !('items' in data) ||
    !Array.isArray(data.items) ||
    !('meta' in data)
  )
    return false;
  const meta = data.meta;
  return (
    !!meta &&
    typeof meta === 'object' &&
    'currentPage' in meta &&
    typeof meta.currentPage === 'number' &&
    'itemsPerPage' in meta &&
    typeof meta.itemsPerPage === 'number' &&
    'totalItems' in meta &&
    typeof meta.totalItems === 'number' &&
    'totalPages' in meta &&
    typeof meta.totalPages === 'number'
  );
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<unknown> | T
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<unknown> | T> {
    const request = context
      .switchToHttp()
      .getRequest<{ path?: string; url?: string }>();
    const requestPath = request.path ?? request.url;

    return next.handle().pipe(
      map((data) => {
        if (requestPath === '/health/live') {
          return data;
        }

        // Nếu đã được đóng gói sẵn
        if (data && typeof data === 'object' && 'success' in data) {
          return data;
        }

        // Nếu là định dạng phân trang từ pagination.helper
        if (isPagination(data)) {
          const { items, meta } = data;
          return {
            success: true,
            data: items,
            meta: {
              page: meta.currentPage,
              limit: meta.itemsPerPage,
              total: meta.totalItems,
              totalPages: meta.totalPages,
            },
          };
        }

        return {
          success: true,
          data: data === undefined ? null : data,
        };
      }),
    );
  }
}
