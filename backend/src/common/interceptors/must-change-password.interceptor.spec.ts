import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { of } from 'rxjs';
import { MustChangePasswordInterceptor } from './must-change-password.interceptor';

describe('MustChangePasswordInterceptor', () => {
  const interceptor = new MustChangePasswordInterceptor();
  const next: CallHandler = { handle: () => of('ok') };

  const contextFor = (path: string, mustChangePassword = true) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          path,
          user: { id: 'user-1', mustChangePassword },
        }),
      }),
    }) as unknown as ExecutionContext;

  it.each([
    '/api/v1/auth/me',
    '/api/v1/auth/change-password',
    '/api/v1/auth/logout',
    '/api/v1/auth/refresh',
  ])('allows the recovery endpoint %s', (path) => {
    expect(interceptor.intercept(contextFor(path), next)).toBeDefined();
  });

  it('blocks business operations until the temporary password is changed', () => {
    expect(() =>
      interceptor.intercept(contextFor('/api/v1/inventory'), next),
    ).toThrow(ForbiddenException);
  });

  it('does not affect accounts using a permanent password', () => {
    expect(
      interceptor.intercept(contextFor('/api/v1/inventory', false), next),
    ).toBeDefined();
  });
});
