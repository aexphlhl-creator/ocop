import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

import { RedisService } from '../../redis/redis.service';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const body: unknown = req.body;
    const refreshToken =
      body && typeof body === 'object' && 'refreshToken' in body
        ? body.refreshToken
        : undefined;
    if (typeof refreshToken !== 'string' || !refreshToken) {
      throw new UnauthorizedException(
        'Refresh token không tìm thấy trong body',
      );
    }

    const isBlacklisted = await this.redisService.get(
      `auth:blacklist:${refreshToken}`,
    );
    if (isBlacklisted) {
      throw new UnauthorizedException('Refresh token đã bị vô hiệu hóa');
    }
    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      version: payload.version,
      refreshToken,
    };
  }
}
