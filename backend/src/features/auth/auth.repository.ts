import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, RoleName } from '@prisma/client';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
  }

  async getRoleByName(name: RoleName) {
    return this.prisma.role.findUnique({
      where: { name },
    });
  }

  async createUser(data: Prisma.UserCreateWithoutRoleInput, roleId: string) {
    return this.prisma.user.create({
      data: {
        ...data,
        role: {
          connect: { id: roleId },
        },
      },
      include: { role: true },
    });
  }
}
