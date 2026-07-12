import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RoleName } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getUsers(
    assignable: boolean, 
    search?: string, 
    page: number = 1, 
    limit: number = 50, 
    sort: string = 'fullName', 
    order: 'asc' | 'desc' = 'asc'
  ) {
    let whereClause: any = {};

    if (assignable) {
      whereClause.role = {
        name: {
          in: [RoleName.ADMIN, RoleName.SELLER], // RBAC logic
        },
      };
      whereClause.isActive = true;
    }

    if (search) {
      whereClause.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          email: true,
          fullName: true,
          role: { select: { name: true } },
          businesses: { select: { name: true }, take: 1 } // Fetch business name for the manager dropdown
        },
        skip,
        take: limit,
        orderBy: { [sort]: order },
      }),
      this.prisma.user.count({ where: whereClause })
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    };
  }
}
