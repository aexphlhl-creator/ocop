import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import {
  RequestUser,
  RequestRefreshUser,
} from '../interfaces/jwt-payload.interface';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: RequestUser | RequestRefreshUser }>();
    return request.user;
  },
);
