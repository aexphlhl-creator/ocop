import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventStatus, RoleName } from '@prisma/client';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  async create(createEventDto: CreateEventDto, user: RequestUser) {
    // Check if slug is unique
    const existing = await this.prisma.event.findUnique({
      where: { slug: createEventDto.slug },
    });
    if (existing) {
      throw new BadRequestException('Slug đã tồn tại');
    }

    return this.prisma.event.create({
      data: {
        ...createEventDto,
        createdById: user.id,
      },
    });
  }

  async findAll(page: number = 1, limit: number = 10, search?: string, status?: EventStatus) {
    const skip = (page - 1) * limit;
    
    const where: any = {};
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { summary: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) {
      where.status = status;
    }
    where.deletedAt = null; // Soft delete

    const [items, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { fullName: true } }
        }
      }),
      this.prisma.event.count({ where }),
    ]);

    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id, deletedAt: null },
      include: {
        createdBy: { select: { fullName: true, email: true } },
        updatedBy: { select: { fullName: true, email: true } }
      }
    });

    if (!event) {
      throw new NotFoundException(`Không tìm thấy sự kiện ${id}`);
    }
    return event;
  }

  async update(id: string, updateEventDto: UpdateEventDto, user: RequestUser) {
    const event = await this.findOne(id);
    
    if (event.createdById !== user.id && user.role !== RoleName.ADMIN) {
      throw new ForbiddenException('Bạn chỉ có quyền sửa sự kiện do bạn tạo');
    }

    if (updateEventDto.slug && updateEventDto.slug !== event.slug) {
      const existing = await this.prisma.event.findUnique({ where: { slug: updateEventDto.slug } });
      if (existing) {
        throw new BadRequestException('Slug đã tồn tại');
      }
    }

    return this.prisma.event.update({
      where: { id },
      data: {
        ...updateEventDto,
        updatedById: user.id,
      },
    });
  }

  // State Machine logic
  // DRAFT -> PUBLISHED -> ONGOING -> COMPLETED
  // DRAFT -> CANCELLED
  // PUBLISHED -> CANCELLED
  
  async publish(id: string, user: RequestUser) {
    const event = await this.findOne(id);
    this.checkPermission(event, user);

    if (event.status !== EventStatus.DRAFT) {
      throw new BadRequestException('Chỉ có thể publish sự kiện đang ở trạng thái DRAFT');
    }

    return this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.PUBLISHED, updatedById: user.id },
    });
  }

  async cancel(id: string, user: RequestUser) {
    const event = await this.findOne(id);
    this.checkPermission(event, user);

    if (event.status !== EventStatus.DRAFT && event.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException('Chỉ có thể hủy sự kiện DRAFT hoặc PUBLISHED');
    }

    return this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.CANCELLED, updatedById: user.id },
    });
  }

  async markAsOngoing(id: string, user: RequestUser) {
    const event = await this.findOne(id);
    this.checkPermission(event, user);

    if (event.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException('Chỉ có thể chuyển sang ONGOING từ PUBLISHED');
    }

    return this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.ONGOING, updatedById: user.id },
    });
  }

  async markAsCompleted(id: string, user: RequestUser) {
    const event = await this.findOne(id);
    this.checkPermission(event, user);

    if (event.status !== EventStatus.ONGOING) {
      throw new BadRequestException('Chỉ có thể chuyển sang COMPLETED từ ONGOING');
    }

    return this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.COMPLETED, updatedById: user.id },
    });
  }

  async remove(id: string, user: RequestUser) {
    const event = await this.findOne(id);
    this.checkPermission(event, user);

    // Soft delete
    return this.prisma.event.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: user.id },
    });
  }

  private checkPermission(event: any, user: RequestUser) {
    if (event.createdById !== user.id && user.role !== RoleName.ADMIN) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này trên sự kiện này');
    }
  }
}
