import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RoleName, User, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';

import { AuthRepository } from './auth.repository';
import { RedisService } from '../redis/redis.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { UserResponseDto } from './dto/user-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  async register(dto: RegisterDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const existing = await this.authRepository.findByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictException('Email đã được sử dụng');
    }

    const targetRoleName = dto.role || RoleName.VISITOR;

    if (
      targetRoleName === RoleName.ADMIN ||
      targetRoleName === RoleName.SELLER ||
      targetRoleName === RoleName.EVENT_COORDINATOR ||
      targetRoleName === RoleName.WAREHOUSE_MANAGER ||
      targetRoleName === RoleName.LOGISTICS
    ) {
      throw new ForbiddenException(
        `Không được phép tự đăng ký vai trò ${targetRoleName}. Tài khoản Seller do Admin cấp.`,
      );
    }

    const userRole = await this.authRepository.getRoleByName(targetRoleName);
    if (!userRole) {
      throw new ConflictException(
        `Hệ thống chưa thiết lập vai trò ${targetRoleName}`,
      );
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    const user = await this.authRepository.createUser(
      {
        email: normalizedEmail,
        fullName: dto.fullName.trim(),
        phone: dto.phone?.trim() || null,
        passwordHash,
        isActive: true,
      },
      userRole.id,
      targetRoleName,
    );
    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role.name,
      user.sessionVersion,
    );
    return {
      ...tokens,
      user: this.mapToUserResponse(user),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.authRepository.findByEmail(
      dto.email.trim().toLowerCase(),
    );
    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    let passwordMatch = false;
    let needsRehash = false;

    // Phân biệt bcrypt cũ ($2a$ hoặc $2b$) và argon2 ($argon2id$)
    if (
      user.passwordHash.startsWith('$2a$') ||
      user.passwordHash.startsWith('$2b$')
    ) {
      passwordMatch = bcrypt.compareSync(dto.password, user.passwordHash);
      if (passwordMatch) needsRehash = true;
    } else {
      try {
        passwordMatch = await argon2.verify(user.passwordHash, dto.password);
      } catch {
        passwordMatch = false;
      }
    }

    if (!passwordMatch) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    // Auto-migrate hash
    if (needsRehash) {
      const newHash = await argon2.hash(dto.password, {
        type: argon2.argon2id,
      });
      await this.authRepository.updatePassword(
        user.id,
        newHash,
        user.mustChangePassword,
      );
    }

    if (!user.isActive) {
      throw new ForbiddenException('Tài khoản đã bị khóa');
    }

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role.name,
      user.sessionVersion,
    );
    return {
      ...tokens,
      user: this.mapToUserResponse(user),
    };
  }

  async refresh(
    userId: string,
    email: string,
    roleName: RoleName,
    refreshToken: string,
    version?: number,
  ) {
    const isBlacklisted = await this.redisService.get(
      `auth:blacklist:${refreshToken}`,
    );
    if (isBlacklisted) {
      throw new UnauthorizedException('Refresh token đã bị vô hiệu hóa');
    }

    const user = await this.authRepository.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Tài khoản không hợp lệ hoặc đã bị khóa');
    }
    if ((version ?? 0) !== user.sessionVersion) {
      throw new UnauthorizedException(
        'Phiên đã bị vô hiệu hóa sau khi đổi mật khẩu',
      );
    }

    // Task 3: Refresh Token Rotation - Blacklist the old refresh token
    await this.blacklistToken(refreshToken);

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role.name,
      user.sessionVersion,
    );
    return {
      ...tokens,
      user: this.mapToUserResponse(user),
    };
  }

  async googleLogin(dto: GoogleLoginDto) {
    let email: string;
    let fullName: string;

    const googleClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const isDemoToken =
      dto.idToken.startsWith('demo-token') ||
      dto.idToken === 'demo-google-token';

    const demoMode = this.configService.get<boolean | string>('DEMO_MODE');
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production' ||
      process.env.NODE_ENV === 'production';
    if (
      isDemoToken &&
      !isProduction &&
      (demoMode === true || demoMode === 'true')
    ) {
      if (dto.idToken.startsWith('demo-token:')) {
        const rawEmail = dto.idToken.replace('demo-token:', '').trim();
        email = rawEmail.toLowerCase();
        fullName = rawEmail.split('@')[0] || 'Google User (Demo)';
      } else {
        email = 'google.demo@ocop.vn';
        fullName = 'Người dùng Google (Demo)';
      }
    } else {
      if (!googleClientId) {
        throw new UnauthorizedException('Đăng nhập Google chưa được cấu hình');
      }
      try {
        const client = new OAuth2Client(googleClientId);
        const ticket = await client.verifyIdToken({
          idToken: dto.idToken,
          audience: googleClientId,
        });
        const payload = ticket.getPayload();
        if (!payload || !payload.email || payload.email_verified !== true) {
          throw new UnauthorizedException(
            'Xác thực Google thất bại: Email chưa được xác minh',
          );
        }
        email = payload.email.trim().toLowerCase();
        fullName = payload.name?.trim() || email.split('@')[0];
      } catch (error: unknown) {
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        throw new UnauthorizedException(
          `Xác thực Google token thất bại: ${error instanceof Error ? error.message : 'Token không hợp lệ'}`,
        );
      }
    }

    let user = await this.authRepository.findByEmail(email);

    if (!user) {
      const visitorRole = await this.authRepository.getRoleByName(
        RoleName.VISITOR,
      );
      if (!visitorRole) {
        throw new ConflictException('Hệ thống chưa thiết lập vai trò VISITOR');
      }

      const randomPassword = crypto.randomUUID() + '-GoogleOcopAuthSecret';
      const passwordHash = await argon2.hash(randomPassword, {
        type: argon2.argon2id,
      });

      user = await this.authRepository.createUser(
        {
          email,
          fullName,
          phone: null,
          passwordHash,
          isActive: true,
        },
        visitorRole.id,
        RoleName.VISITOR,
      );
    }

    if (!user.isActive) {
      throw new ForbiddenException('Tài khoản của bạn đã bị vô hiệu hóa');
    }

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role.name,
      user.sessionVersion,
    );

    return {
      ...tokens,
      user: this.mapToUserResponse(user),
    };
  }

  async logout(refreshToken: string, accessToken?: string) {
    await this.blacklistToken(refreshToken);
    if (accessToken) {
      await this.blacklistToken(accessToken);
    }
    return { message: 'Đăng xuất thành công' };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const updated = await this.authRepository.updateProfile(
      userId,
      dto.fullName.trim(),
      dto.phone,
    );
    return this.mapToUserResponse(updated);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.authRepository.findById(userId);
    if (!user) throw new UnauthorizedException('Tài khoản không tồn tại');

    const currentMatches = await this.verifyPassword(
      user.passwordHash,
      dto.currentPassword,
    );
    if (!currentMatches) {
      throw new UnauthorizedException('Mật khẩu hiện tại không chính xác');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new ConflictException('Mật khẩu mới phải khác mật khẩu hiện tại');
    }

    const passwordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
    });
    await this.authRepository.updatePassword(userId, passwordHash, false, true);
    return { message: 'Đổi mật khẩu thành công', mustChangePassword: false };
  }

  private async verifyPassword(passwordHash: string, password: string) {
    if (passwordHash.startsWith('$2a$') || passwordHash.startsWith('$2b$')) {
      return bcrypt.compareSync(password, passwordHash);
    }
    try {
      return await argon2.verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: string,
    version = 0,
  ) {
    const payload: JwtPayload = { sub: userId, email, role, version };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
        expiresIn: this.configService.getOrThrow<string>(
          'JWT_EXPIRES_IN',
        ) as unknown as number,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.getOrThrow<string>(
          'JWT_REFRESH_EXPIRES_IN',
        ) as unknown as number,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async blacklistToken(token: string) {
    try {
      const decoded: unknown = this.jwtService.decode(token);
      if (
        decoded &&
        typeof decoded === 'object' &&
        'exp' in decoded &&
        typeof decoded.exp === 'number'
      ) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          await this.redisService.set(`auth:blacklist:${token}`, 'true', ttl);
        }
      }
    } catch {
      await this.redisService.set(`auth:blacklist:${token}`, 'true', 604800);
    }
  }

  mapToUserResponse(user: User & { role: Role }): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role.name,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt,
    };
  }
}
