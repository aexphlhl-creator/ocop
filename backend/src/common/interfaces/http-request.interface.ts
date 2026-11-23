import type { Request } from 'express';
import type { RequestUser } from '../../features/auth/interfaces/jwt-payload.interface';

export type AppRequest = Request & { user?: RequestUser };

export function httpErrorStatus(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = error.status;
    if (
      typeof status === 'number' &&
      Number.isInteger(status) &&
      status >= 400 &&
      status <= 599
    )
      return status;
  }
  return 500;
}
