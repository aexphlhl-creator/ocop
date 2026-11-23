import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventStatus, RoleName } from '@prisma/client';
import { requestUser } from '../../../test/helpers/request-user';

describe('EventsService', () => {
  let service: EventsService;
  const prisma = {
    event: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.event.findMany.mockResolvedValue([]);
    prisma.event.count.mockResolvedValue(0);
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('keeps public visibility restrictions when a caller explicitly filters drafts', async () => {
    await service.findAll(1, 10, undefined, EventStatus.DRAFT);
    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: {
        status: EventStatus.DRAFT,
        isPublic: true,
        deletedAt: null,
        AND: [
          {
            status: {
              in: [
                EventStatus.PUBLISHED,
                EventStatus.ONGOING,
                EventStatus.COMPLETED,
              ],
            },
          },
        ],
      },
      skip: 0,
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { fullName: true } } },
    });
  });

  it.each([
    { isPublic: true, status: EventStatus.DRAFT },
    { isPublic: false, status: EventStatus.PUBLISHED },
  ])('does not expose a hidden event through its slug', async (event) => {
    prisma.event.findFirst.mockResolvedValue(event);
    await expect(service.findOne('hidden-event')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lets an administrator inspect drafts', async () => {
    const event = { isPublic: false, status: EventStatus.DRAFT };
    prisma.event.findFirst.mockResolvedValue(event);
    await expect(
      service.findOne('draft', requestUser({ role: RoleName.ADMIN })),
    ).resolves.toEqual(event);
  });

  it('rejects invalid pagination before querying Prisma', async () => {
    await expect(service.findAll(-1, 10)).rejects.toThrow(BadRequestException);
    await expect(service.findAll(1, 101)).rejects.toThrow(BadRequestException);
    expect(prisma.event.findMany).not.toHaveBeenCalled();
  });

  it('rejects an end date before the start date without creating an event', async () => {
    await expect(
      service.create(
        {
          title: 'Test',
          slug: 'test',
          description: 'Test',
          startDate: '2026-10-02T00:00:00Z',
          endDate: '2026-10-01T00:00:00Z',
        },
        requestUser({ role: RoleName.ADMIN }),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.event.create).not.toHaveBeenCalled();
  });

  it('validates an updated date against the unchanged date', async () => {
    const admin = requestUser({ role: RoleName.ADMIN });
    prisma.event.findFirst.mockResolvedValue({
      createdById: admin.id,
      startDate: new Date('2026-10-01'),
      endDate: new Date('2026-10-02'),
    });
    await expect(
      service.update('test', { startDate: '2026-10-03T00:00:00Z' }, admin),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.event.update).not.toHaveBeenCalled();
  });
});
