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

    const sellerRole = await this.authRepository.getRoleByName(RoleName.SELLER);
    if (!sellerRole) {
      throw new ConflictException('Hệ thống chưa thiết lập vai trò SELLER');
    }

    const passwordHash = bcrypt.hashSync(dto.password, 10);

    const user = await this.authRepository.createUser(
      {
        email: dto.email,
        fullName: dto.fullName,
        phone: dto.phone,
        passwordHash,
        isActive: true,
      },
      sellerRole.id,
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

    const passwordMatch = bcrypt.compareSync(dto.password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
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

    // Đưa refresh token cũ vào blacklist (Token Rotation)
    await this.blacklistToken(refreshToken);

    const user = await this.authRepository.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Tài khoản không hợp lệ hoặc đã bị khóa');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role.name);
    return {
      ...tokens,
      user: this.mapToUserResponse(user),
    };
  }

  async logout(refreshToken: string) {
    await this.blacklistToken(refreshToken);
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
