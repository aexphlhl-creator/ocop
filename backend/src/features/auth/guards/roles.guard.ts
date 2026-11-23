import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RequestUser } from '../interfaces/jwt-payload.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleName[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: RequestUser }>();
    if (!user || !user.role) {
      throw new ForbiddenException('Bạn không có quyền truy cập chức năng này');
    }
    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException(
        'Tài khoản của bạn không được phân quyền truy cập chức năng này',
      );
    }
    return true;
  }
}
