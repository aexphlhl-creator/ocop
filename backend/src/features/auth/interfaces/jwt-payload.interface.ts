import { RoleName } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  version?: number;
}

export class RequestUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: RoleName;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
}

export class RequestRefreshUser {
  sub: string;
  email: string;
  role: RoleName;
  refreshToken: string;
  version?: number;
}
