import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { LoginInput, RegisterInput } from './dto/auth.schema';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private get accessSecret(): string {
    return process.env.JWT_ACCESS_SECRET ?? 'change_me_access';
  }

  private get refreshSecret(): string {
    return process.env.JWT_REFRESH_SECRET ?? 'change_me_refresh';
  }

  async register(dto: RegisterInput): Promise<{ id: string; email: string }> {
    const passwordHash = await bcrypt.hash(
      dto.password,
      Number(process.env.BCRYPT_ROUNDS ?? 10),
    );
    return this.users.create(dto.email, passwordHash);
  }

  async login(dto: LoginInput): Promise<TokenPair> {
    const user = await this.users.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return this.issueTokens(user.id, user.email);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string; email: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: this.refreshSecret });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const record = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: this.hash(refreshToken), revoked: false },
    });
    if (!record || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token revoked or expired');
    }
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revoked: true },
    });
    return this.issueTokens(payload.sub, payload.email);
  }

  private async issueTokens(sub: string, email: string): Promise<TokenPair> {
    const accessToken = this.jwt.sign(
      { sub, email },
      { secret: this.accessSecret, expiresIn: Number(process.env.JWT_ACCESS_TTL ?? 900) },
    );
    const refreshToken = this.jwt.sign(
      { sub, email },
      { secret: this.refreshSecret, expiresIn: Number(process.env.JWT_REFRESH_TTL ?? 1209600) },
    );
    await this.prisma.refreshToken.create({
      data: {
        userId: sub,
        tokenHash: this.hash(refreshToken),
        expiresAt: new Date(Date.now() + Number(process.env.JWT_REFRESH_TTL ?? 1209600) * 1000),
      },
    });
    return { accessToken, refreshToken };
  }

  private hash(token: string): string {
    // Non-cryptographic memoization is fine for lookup; refresh tokens are
    // high-entropy. Uses sha256 for a stable lookup key.
    return createHash('sha256').update(token).digest('hex');
  }
}
