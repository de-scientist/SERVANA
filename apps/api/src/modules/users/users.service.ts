import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtUser {
  sub: string;
  email: string;
  roles: string[];
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(email: string, passwordHash: string): Promise<{ id: string; email: string }> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');
    const user = await this.prisma.user.create({
      data: { email, passwordHash },
    });
    return { id: user.id, email: user.email };
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getRoles(userId: string): Promise<string[]> {
    const links = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
    return links.map((l) => l.role.name);
  }
}
