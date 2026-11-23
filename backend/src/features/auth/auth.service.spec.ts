import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import {
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { RoleName, User, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const mockVerifyIdToken = jest.fn();
jest.mock('google-auth-library', () => {
  return {
    OAuth2Client: jest.fn().mockImplementation(() => ({
      verifyIdToken: mockVerifyIdToken,
    })),
  };
});

describe('AuthService', () => {
  let service: AuthService;
  let repository: jest.Mocked<
    Pick<
      AuthRepository,
      | 'findByEmail'
      | 'findById'
      | 'getRoleByName'
      | 'createUser'
      | 'updatePassword'
    >
  >;
  let jwtService: jest.Mocked<Pick<JwtService, 'signAsync' | 'decode'>>;
  let configService: jest.Mocked<Pick<ConfigService, 'getOrThrow' | 'get'>>;
  let redisService: jest.Mocked<Pick<RedisService, 'get' | 'set'>>;

  const mockRole: Role = {
    id: 'role-uuid',
    name: RoleName.SELLER,
    description: 'Seller role',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUser: User & { role: Role; sellerProfile: null } = {
    id: 'user-uuid',
    email: 'test@example.com',
    fullName: 'Test User',
    passwordHash: bcrypt.hashSync('correctPassword', 10),
    phone: '0123456789',
    isActive: true,
    mustChangePassword: false,
    sessionVersion: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    roleId: 'role-uuid',
    role: mockRole,
    sellerProfile: null,
  };

  beforeEach(async () => {
    repository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      getRoleByName: jest.fn(),
      createUser: jest.fn(),
      updatePassword: jest.fn(),
    };

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('mockToken'),
      decode: jest
        .fn()
        .mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 }),
    };

    configService = {
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key === 'JWT_SECRET') return 'secret';
        if (key === 'JWT_EXPIRES_IN') return '1h';
        if (key === 'JWT_REFRESH_SECRET') return 'refresh_secret';
        if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
        return undefined;
      }),
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'DEMO_MODE') return 'true';
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

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should reject public registration as a warehouse manager', async () => {
      repository.findByEmail.mockResolvedValue(null);

      await expect(
        service.register({
          ...registerDto,
          role: RoleName.WAREHOUSE_MANAGER,
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(repository.createUser).not.toHaveBeenCalled();
    });

    it('should reject public registration as Logistics', async () => {
      repository.findByEmail.mockResolvedValue(null);

      await expect(
        service.register({
          ...registerDto,
          role: RoleName.LOGISTICS,
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(repository.createUser).not.toHaveBeenCalled();
    });

    it('should reject public registration as Seller', async () => {
      repository.findByEmail.mockResolvedValue(null);

      await expect(
        service.register({ ...registerDto, role: RoleName.SELLER }),
      ).rejects.toThrow(ForbiddenException);

      expect(repository.createUser).not.toHaveBeenCalled();
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

      await expect(service.login(wrongLoginDto)).rejects.toThrow(
        UnauthorizedException,
      );
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

      const result = await service.refresh(
        mockUser.id,
        mockUser.email,
        RoleName.SELLER,
        'oldRefreshToken',
      );

      expect(result).toHaveProperty('accessToken', 'mockToken');
      expect(result).toHaveProperty('refreshToken', 'mockToken');
      expect(redisService.set).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if token is blacklisted', async () => {
      redisService.get.mockResolvedValue('true');

      await expect(
        service.refresh(
          mockUser.id,
          mockUser.email,
          RoleName.SELLER,
          'blacklistedRefreshToken',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
    it('rejects a refresh token issued before a password change', async () => {
      repository.findById.mockResolvedValue({ ...mockUser, sessionVersion: 1 });
      await expect(
        service.refresh(
          mockUser.id,
          mockUser.email,
          RoleName.SELLER,
          'oldRefreshToken',
          0,
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('verifies the current password and clears the temporary-password flag', async () => {
      repository.findById.mockResolvedValue({
        ...mockUser,
        mustChangePassword: true,
      });

      const result = await service.changePassword(mockUser.id, {
        currentPassword: 'correctPassword',
        newPassword: 'NewSecure123',
      });

      expect(repository.updatePassword).toHaveBeenCalledWith(
        mockUser.id,
        expect.stringMatching(/^\$argon2id\$/),
        false,
        true,
      );
      expect(result.mustChangePassword).toBe(false);
    });

    it('rejects an incorrect current password', async () => {
      repository.findById.mockResolvedValue(mockUser);

      await expect(
        service.changePassword(mockUser.id, {
          currentPassword: 'incorrectPassword',
          newPassword: 'NewSecure123',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(repository.updatePassword).not.toHaveBeenCalled();
    });
  });

  describe('googleLogin', () => {
    it('rejects a demo token in production without Google configuration', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'DEMO_MODE') return 'true';
        return undefined;
      });
      await expect(
        service.googleLogin({ idToken: 'demo-token:admin@example.com' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(repository.findByEmail).not.toHaveBeenCalled();
    });
    const mockVisitorRole: Role = {
      id: 'visitor-role-uuid',
      name: RoleName.VISITOR,
      description: 'Visitor role',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('logs in successfully with demo token for existing user', async () => {
      repository.findByEmail.mockResolvedValue(mockUser);

      const result = await service.googleLogin({
        idToken: 'demo-google-token',
      });

      expect(result).toHaveProperty('accessToken', 'mockToken');
      expect(result).toHaveProperty('refreshToken', 'mockToken');
      expect(result.user.email).toBe(mockUser.email);
    });

    it('registers a new visitor user when demo token user does not exist', async () => {
      repository.findByEmail.mockResolvedValue(null);
      repository.getRoleByName.mockResolvedValue(mockVisitorRole);
      repository.createUser.mockResolvedValue({
        ...mockUser,
        id: 'new-user-id',
        email: 'newuser@example.com',
        role: mockVisitorRole,
      });

      const result = await service.googleLogin({
        idToken: 'demo-token:newuser@example.com',
      });

      expect(repository.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'newuser@example.com',
          isActive: true,
        }),
        mockVisitorRole.id,
        RoleName.VISITOR,
      );
      expect(result).toHaveProperty('accessToken', 'mockToken');
      expect(result.user.email).toBe('newuser@example.com');
    });

    it('throws ConflictException if VISITOR role is missing in system', async () => {
      repository.findByEmail.mockResolvedValue(null);
      repository.getRoleByName.mockResolvedValue(null);

      await expect(
        service.googleLogin({ idToken: 'demo-google-token' }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ForbiddenException when user account is deactivated', async () => {
      repository.findByEmail.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      await expect(
        service.googleLogin({ idToken: 'demo-google-token' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('verifies real Google token via OAuth2Client when credentials configured', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'GOOGLE_CLIENT_ID') return 'client-id-123';
        if (key === 'DEMO_MODE') return 'false';
        return undefined;
      });

      mockVerifyIdToken.mockResolvedValueOnce({
        getPayload: () => ({
          email: 'verified@gmail.com',
          email_verified: true,
          name: 'Verified User',
        }),
      });

      repository.findByEmail.mockResolvedValue({
        ...mockUser,
        email: 'verified@gmail.com',
      });

      const result = await service.googleLogin({
        idToken: 'valid-google-jwt-token',
      });

      expect(mockVerifyIdToken).toHaveBeenCalledWith({
        idToken: 'valid-google-jwt-token',
        audience: 'client-id-123',
      });
      expect(result.user.email).toBe('verified@gmail.com');
    });

    it('verifies real Google token and falls back to email prefix when name is absent', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'GOOGLE_CLIENT_ID') return 'client-id-123';
        if (key === 'DEMO_MODE') return 'false';
        return undefined;
      });

      mockVerifyIdToken.mockResolvedValueOnce({
        getPayload: () => ({
          email: 'noname@gmail.com',
          email_verified: true,
        }),
      });

      repository.findByEmail.mockResolvedValue({
        ...mockUser,
        email: 'noname@gmail.com',
      });

      const result = await service.googleLogin({
        idToken: 'valid-google-jwt-without-name',
      });

      expect(result.user.email).toBe('noname@gmail.com');
    });

    it('throws UnauthorizedException if Google token payload does not contain email', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'GOOGLE_CLIENT_ID') return 'client-id-123';
        if (key === 'DEMO_MODE') return 'false';
        return undefined;
      });

      mockVerifyIdToken.mockResolvedValueOnce({
        getPayload: () => ({}),
      });

      await expect(
        service.googleLogin({ idToken: 'token-missing-email' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when OAuth2Client verification throws error', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'GOOGLE_CLIENT_ID') return 'client-id-123';
        if (key === 'DEMO_MODE') return 'false';
        return undefined;
      });

      mockVerifyIdToken.mockRejectedValueOnce(
        new Error('Invalid token signature'),
      );

      await expect(
        service.googleLogin({ idToken: 'corrupted-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
