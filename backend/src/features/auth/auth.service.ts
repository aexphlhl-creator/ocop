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

import { AuthRepository } from './auth.repository';
import { RedisService } from '../redis/redis.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { UserResponseDto } from './dto/user-response.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.authRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email đã được sử dụng');
    }

    const targetRoleName = dto.role || RoleName.VISITOR;

    if (targetRoleName === RoleName.ADMIN || targetRoleName === RoleName.EVENT_COORDINATOR) {
      throw new ForbiddenException(`Không được phép đăng ký vai trò ${targetRoleName}`);
    }

    const userRole = await this.authRepository.getRoleByName(targetRoleName);
    if (!userRole) {
      throw new ConflictException(`Hệ thống chưa thiết lập vai trò ${targetRoleName}`);
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    const user = await this.authRepository.createUser(
      {
        email: dto.email,
        fullName: dto.fullName,
        phone: dto.phone,
        passwordHash,
        isActive: true,
      },
      userRole.id,
    );
    const tokens = await this.generateTokens(user.id, user.email, user.role.name);
    return {
      ...tokens,
      user: this.mapToUserResponse(user),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.authRepository.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    let passwordMatch = false;
    let needsRehash = false;

    // Phân biệt bcrypt cũ ($2a$ hoặc $2b$) và argon2 ($argon2id$)
    if (user.passwordHash.startsWith('$2a$') || user.passwordHash.startsWith('$2b$')) {
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
      const newHash = await argon2.hash(dto.password, { type: argon2.argon2id });
      await this.authRepository.updatePassword(user.id, newHash);
    }

    if (!user.isActive) {
      throw new ForbiddenException('Tài khoản đã bị khóa');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role.name);
    return {
      ...tokens,
      user: this.mapToUserResponse(user),
    };
  }

  async refresh(userId: string, email: string, roleName: RoleName, refreshToken: string) {
    const isBlacklisted = await this.redisService.get(`auth:blacklist:${refreshToken}`);
    if (isBlacklisted) {
      throw new UnauthorizedException('Refresh token đã bị vô hiệu hóa');
    }

    const user = await this.authRepository.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Tài khoản không hợp lệ hoặc đã bị khóa');
    }

    // Task 3: Refresh Token Rotation - Blacklist the old refresh token
    await this.blacklistToken(refreshToken);

    const tokens = await this.generateTokens(user.id, user.email, user.role.name);
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

  private async generateTokens(userId: string, email: string, role: string) {
    const payload: JwtPayload = { sub: userId, email, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
        expiresIn: this.configService.getOrThrow<string>('JWT_EXPIRES_IN') as unknown as number,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN') as unknown as number,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async blacklistToken(token: string) {
    try {
      const decoded = this.jwtService.decode(token) as { exp?: number } | null;
      if (decoded && decoded.exp) {
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
      role: user.role.name as RoleName,
      isActive: user.isActive,
      createdAt: user.createdAt,
    };
  }
}
