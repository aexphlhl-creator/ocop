import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      throw (
        (err instanceof Error ? err : undefined) ||
        new UnauthorizedException(
          'Phiên đăng nhập không hợp lệ hoặc đã hết hạn',
        )
      );
    }
    return user;
  }
}
