import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, RoleName } from '@prisma/client';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
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

  async createUser(
    data: Prisma.UserCreateWithoutRoleInput,
    roleId: string,
    roleName?: RoleName,
  ) {
    return this.prisma.user.create({
      data: {
        ...data,
        role: {
          connect: { id: roleId },
        },
        ...(roleName === RoleName.SELLER
          ? {
              sellerProfile: {
                create: {
                  displayName: data.fullName,
                  phone: data.phone ?? null,
                  email: data.email,
                },
              },
            }
          : {}),
      },
      include: { role: true, sellerProfile: true },
    });
  }

  async updatePassword(
    id: string,
    passwordHash: string,
    mustChangePassword = false,
    revokeSessions = false,
  ) {
    return this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword,
        ...(revokeSessions ? { sessionVersion: { increment: 1 } } : {}),
      },
    });
  }

  async updateProfile(id: string, fullName: string, phone?: string) {
    return this.prisma.user.update({
      where: { id },
      data: { fullName, phone: phone?.trim() || null },
      include: { role: true },
    });
  }
}
