import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileInput } from './dto/profile.schema';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  profileImage: string | null;
  status: string;
  emailVerified: boolean;
  roles: string[];
  lat: number | null;
  lng: number | null;
  address: unknown;
  preferences: unknown;
  createdAt: Date;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    email: string,
    passwordHash: string,
    name: string,
    phone?: string,
  ): Promise<{ id: string; email: string }> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');
    const user = await this.prisma.user.create({
      data: { email, passwordHash, name, phone },
    });
    return { id: user.id, email: user.email };
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: { roles: { include: { role: true } } },
    });
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

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      profileImage: user.profileImage,
      status: user.status,
      emailVerified: user.emailVerified,
      roles: user.roles.map((r) => r.role.name),
      lat: user.lat,
      lng: user.lng,
      address: user.address,
      preferences: user.preferences,
      createdAt: user.createdAt,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileInput): Promise<UserProfile> {
    await this.findById(userId);
    const data: Prisma.UserUpdateInput = { ...dto };
    // Prisma requires its JsonNull sentinel for explicit nulls on Json columns.
    if (dto.preferences === null) data.preferences = Prisma.JsonNull;
    if (dto.address === null) data.address = Prisma.JsonNull;
    await this.prisma.user.update({ where: { id: userId }, data });
    return this.getProfile(userId);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new ConflictException('Current password is incorrect');
    const passwordHash = await bcrypt.hash(newPassword, Number(process.env.BCRYPT_ROUNDS ?? 10));
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    // Invalidate existing sessions so the new password takes effect everywhere.
    await this.prisma.refreshToken.updateMany({ where: { userId }, data: { revoked: true } });
  }

  async changeEmail(userId: string, password: string, newEmail: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new ConflictException('Password is incorrect');
    const clash = await this.prisma.user.findUnique({ where: { email: newEmail } });
    if (clash) throw new ConflictException('Email already in use');
    await this.prisma.user.update({
      where: { id: userId },
      data: { email: newEmail, emailVerified: false },
    });
    return newEmail;
  }

  /** Admin: list users (id, email, name, status, roles). */
  async list(): Promise<Array<{ id: string; email: string; name: string; status: string; roles: string[] }>> {
    const users = await this.prisma.user.findMany({
      include: { roles: { include: { role: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      status: u.status,
      roles: u.roles.map((r) => r.role.name),
    }));
  }

  /** Admin: set account status. */
  async setStatus(userId: string, status: string): Promise<void> {
    await this.findById(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: status as Prisma.UserStatus },
    });
  }
}
