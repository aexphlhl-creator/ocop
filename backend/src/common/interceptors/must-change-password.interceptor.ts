import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import type { RequestUser } from '../../features/auth/interfaces/jwt-payload.interface';

@Injectable()
export class MustChangePasswordInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as RequestUser | undefined;
    if (!user?.mustChangePassword) return next.handle();

    const path = request.path;
    const allowed =
      path === '/api/v1/auth/me' ||
      path === '/api/v1/auth/change-password' ||
      path === '/api/v1/auth/logout' ||
      path === '/api/v1/auth/refresh';
    if (!allowed) {
      throw new ForbiddenException(
        'Bạn phải đổi mật khẩu tạm trước khi sử dụng chức năng này',
      );
    }
    return next.handle();
  }
}
