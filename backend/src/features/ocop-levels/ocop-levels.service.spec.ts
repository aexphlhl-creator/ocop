import { Test, TestingModule } from '@nestjs/testing';
import { OcopLevelsService } from './ocop-levels.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { NotFoundException } from '@nestjs/common';

describe('OcopLevelsService', () => {
  let service: OcopLevelsService;

  const mockLevels = [
    { id: 'level-3', level: 3, title: '3 Sao OCOP', color: '#3498db', icon: 'star-3' },
    { id: 'level-4', level: 4, title: '4 Sao OCOP', color: '#e67e22', icon: 'star-4' },
    { id: 'level-5', level: 5, title: '5 Sao OCOP', color: '#f1c40f', icon: 'star-5' },
  ];

  const mockPrisma = {
    ocopLevel: {
      findMany: jest.fn().mockResolvedValue(mockLevels),
      findUnique: jest.fn().mockImplementation(({ where: { id } }) => {
        const found = mockLevels.find((l) => l.id === id);
        return Promise.resolve(found || null);
      }),
    },
  };

  const mockRedis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OcopLevelsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<OcopLevelsService>(OcopLevelsService);
  });

  it('findAll returns all OCOP levels from database and caches them', async () => {
    const result = await service.findAll();
    expect(result).toHaveLength(3);
    expect(mockPrisma.ocopLevel.findMany).toHaveBeenCalled();
    expect(mockRedis.set).toHaveBeenCalledWith(
      'ocop_levels:list',
      JSON.stringify(mockLevels),
      3600,
    );
  });

  it('findAll returns cached levels if present in Redis', async () => {
    mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockLevels));
    const result = await service.findAll();
    expect(result).toHaveLength(3);
    expect(mockPrisma.ocopLevel.findMany).not.toHaveBeenCalled();
  });

  it('findOne returns level by id', async () => {
    const result = await service.findOne('level-3');
    expect(result.title).toBe('3 Sao OCOP');
  });

  it('findOne throws NotFoundException when level not found', async () => {
    await expect(service.findOne('level-non-existent')).rejects.toThrow(NotFoundException);
  });
});
