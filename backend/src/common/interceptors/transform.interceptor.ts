import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces/api-response.interface';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<any>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<any>> {
    const request = context.switchToHttp().getRequest<{ path?: string; url?: string }>();
    const requestPath = request.path ?? request.url;

    return next.handle().pipe(
      map((data) => {
        if (requestPath === '/health/live') {
          return data as ApiResponse<any>;
        }

        // Nếu đã được đóng gói sẵn
        if (data && typeof data === 'object' && 'success' in data) {
          return data as ApiResponse<any>;
        }

        // Nếu là định dạng phân trang từ pagination.helper
        if (data && typeof data === 'object' && 'items' in data && 'meta' in data) {
          const { items, meta } = data as any;
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
