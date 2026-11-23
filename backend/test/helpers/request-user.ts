import { RoleName } from '@prisma/client';
import type { RequestUser } from '../../src/features/auth/interfaces/jwt-payload.interface';

export function requestUser(overrides: Partial<RequestUser> = {}): RequestUser {
  return {
    id: 'test-user',
    email: 'user@example.test',
    fullName: 'Test User',
    phone: null,
    role: RoleName.VISITOR,
    isActive: true,
    mustChangePassword: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}
