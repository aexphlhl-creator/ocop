import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { ConflictException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { RoleName, User, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let repository: jest.Mocked<Partial<AuthRepository>>;
  let jwtService: jest.Mocked<Partial<JwtService>>;
  let configService: jest.Mocked<Partial<ConfigService>>;
  let redisService: jest.Mocked<Partial<RedisService>>;

  const mockRole: Role = {
    id: 'role-uuid',
    name: RoleName.SELLER,
    description: 'Seller role',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUser: User & { role: Role } = {
    id: 'user-uuid',
    email: 'test@example.com',
    fullName: 'Test User',
    passwordHash: bcrypt.hashSync('correctPassword', 10),
    phone: '0123456789',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    roleId: 'role-uuid',
    role: mockRole,
  };

  beforeEach(async () => {
    repository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      getRoleByName: jest.fn(),
      createUser: jest.fn(),
    };

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('mockToken'),
      decode: jest.fn().mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 }),
    };

    configService = {
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key === 'JWT_SECRET') return 'secret';
        if (key === 'JWT_EXPIRES_IN') return '1h';
        if (key === 'JWT_REFRESH_SECRET') return 'refresh_secret';
        if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
        return undefined;
      }),
    };

    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuthRepository, useValue: repository },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    const registerDto = {
      fullName: 'Test User',
      email: 'test@example.com',
      password: 'correctPassword',
      phone: '0123456789',
    };

    it('should register successfully', async () => {
      repository.findByEmail.mockResolvedValue(null);
      repository.getRoleByName.mockResolvedValue(mockRole);
      repository.createUser.mockResolvedValue(mockUser);

      const result = await service.register(registerDto);

      expect(result).toHaveProperty('accessToken', 'mockToken');
      expect(result).toHaveProperty('refreshToken', 'mockToken');
      expect(result.user).toHaveProperty('email', 'test@example.com');
      expect(repository.createUser).toHaveBeenCalled();
    });

    it('should throw ConflictException if email exists', async () => {
      repository.findByEmail.mockResolvedValue(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'correctPassword',
    };

    it('should login successfully', async () => {
      repository.findByEmail.mockResolvedValue(mockUser);

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('accessToken', 'mockToken');
      expect(result).toHaveProperty('refreshToken', 'mockToken');
      expect(result.user).toHaveProperty('email', 'test@example.com');
    });

    it('should throw UnauthorizedException if wrong password', async () => {
      repository.findByEmail.mockResolvedValue(mockUser);

      const wrongLoginDto = {
        email: 'test@example.com',
        password: 'wrongPassword',
      };

      await expect(service.login(wrongLoginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException if user is inactive', async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      repository.findByEmail.mockResolvedValue(inactiveUser);

      await expect(service.login(loginDto)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('refresh', () => {
    it('should refresh tokens successfully', async () => {
      redisService.get.mockResolvedValue(null);
      repository.findById.mockResolvedValue(mockUser);

      const result = await service.refresh(mockUser.id, mockUser.email, RoleName.SELLER, 'oldRefreshToken');

      expect(result).toHaveProperty('accessToken', 'mockToken');
      expect(result).toHaveProperty('refreshToken', 'mockToken');
      expect(redisService.set).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if token is blacklisted', async () => {
      redisService.get.mockResolvedValue('true');

      await expect(
        service.refresh(mockUser.id, mockUser.email, RoleName.SELLER, 'blacklistedRefreshToken'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
