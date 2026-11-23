import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtRefreshAuthGuard extends AuthGuard('jwt-refresh') {
  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      throw (
        (err instanceof Error ? err : undefined) ||
        new UnauthorizedException('Refresh token không hợp lệ hoặc đã hết hạn')
      );
    }
    return user;
  }
}
