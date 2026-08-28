import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { RbacService } from '../rbac/rbac.service';
import { AuditService } from '../audit/audit.service';
import { NOTIFICATION_PROVIDER, NotificationProvider } from '../../common/adapters/notification/notification.provider';
import {
  generateToken,
  hashToken,
  isExpired,
  tokenExpiry,
} from '../../common/security/tokens';
import {
  ChangeEmailInput,
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResendVerificationInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from './dto/auth.schema';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const EMAIL_VERIFY_TTL = Number(process.env.EMAIL_VERIFY_TTL ?? 86400);
const PASSWORD_RESET_TTL = Number(process.env.PASSWORD_RESET_TTL ?? 1800);

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    @Inject(NOTIFICATION_PROVIDER) private readonly notifications: NotificationProvider,
  ) {}

  private get accessSecret(): string {
    return process.env.JWT_ACCESS_SECRET ?? 'change_me_access';
  }

  private get refreshSecret(): string {
    return process.env.JWT_REFRESH_SECRET ?? 'change_me_refresh';
  }

  private appUrl(): string {
    return process.env.APP_URL ?? 'http://localhost:3000';
  }

  async register(dto: RegisterInput, ip?: string): Promise<{ user: { id: string; email: string }; tokens: TokenPair }> {
    const passwordHash = await bcrypt.hash(dto.password, Number(process.env.BCRYPT_ROUNDS ?? 10));
    const created = await this.users.create(dto.email, passwordHash, dto.name, dto.phone);
    await this.rbac.assignRole(created.id, 'CUSTOMER');
    if (dto.role === 'PROVIDER') await this.rbac.assignRole(created.id, 'PROVIDER');

    const roles = await this.users.getRoles(created.id);
    const verifyToken = generateToken();
    await this.prisma.user.update({
      where: { id: created.id },
      data: {
        emailVerifyToken: hashToken(verifyToken),
        emailVerifyExpires: tokenExpiry(EMAIL_VERIFY_TTL),
      },
    });
    await this.notifications.send({
      channel: 'EMAIL',
      to: dto.email,
      subject: 'Verify your SERVANA email',
      body: `Welcome to SERVANA. Verify your email: ${this.appUrl()}/verify-email?token=${verifyToken}`,
      templateKey: 'email.verify',
      userId: created.id,
    });
    await this.audit.record({ actorId: created.id, action: 'user.register', entity: 'user', entityId: created.id, ip });

    const tokens = await this.issueTokens(created.id, dto.email, roles);
    return { user: created, tokens };
  }

  async login(dto: LoginInput, ip?: string): Promise<TokenPair> {
    const user = await this.users.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      await this.audit.record({ actorId: user.id, action: 'auth.login.failed', entity: 'user', entityId: user.id, ip });
      throw new UnauthorizedException('Invalid credentials');
    }
    const roles = user.roles.map((r) => r.role.name);
    await this.audit.record({ actorId: user.id, action: 'auth.login', entity: 'user', entityId: user.id, ip });
    return this.issueTokens(user.id, user.email, roles);
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
    if (!record || isExpired(record.expiresAt)) {
      throw new UnauthorizedException('Refresh token revoked or expired');
    }
    await this.prisma.refreshToken.update({ where: { id: record.id }, data: { revoked: true } });
    const roles = await this.users.getRoles(payload.sub);
    return this.issueTokens(payload.sub, payload.email, roles);
  }

  async logout(refreshToken: string, ip?: string): Promise<void> {
    const record = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: this.hash(refreshToken), revoked: false },
    });
    if (record) {
      await this.prisma.refreshToken.update({ where: { id: record.id }, data: { revoked: true } });
      await this.audit.record({ actorId: record.userId, action: 'auth.logout', entity: 'session', entityId: record.id, ip });
    }
  }

  async revokeAllSessions(userId: string, ip?: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
    await this.audit.record({ actorId: userId, action: 'auth.logout.all', entity: 'user', entityId: userId, ip });
  }

  async listSessions(userId: string) {
    const tokens = await this.prisma.refreshToken.findMany({
      where: { userId, revoked: false },
      orderBy: { createdAt: 'desc' },
    });
    return tokens.map((t) => ({
      id: t.id,
      createdAt: t.createdAt,
      expiresAt: t.expiresAt,
      current: false,
    }));
  }

  async revokeSession(userId: string, id: string, ip?: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { id, userId, revoked: false },
      data: { revoked: true },
    });
    await this.audit.record({ actorId: userId, action: 'auth.session.revoke', entity: 'session', entityId: id, ip });
  }

  async forgotPassword(dto: ForgotPasswordInput, ip?: string): Promise<void> {
    const user = await this.users.findByEmail(dto.email);
    if (!user) return; // Do not reveal account existence
    const token = generateToken();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: hashToken(token), passwordResetExpires: tokenExpiry(PASSWORD_RESET_TTL) },
    });
    await this.notifications.send({
      channel: 'EMAIL',
      to: user.email,
      subject: 'Reset your SERVANA password',
      body: `Reset your password (valid 30 min): ${this.appUrl()}/reset-password?token=${token}`,
      templateKey: 'email.reset',
      userId: user.id,
    });
    await this.audit.record({ actorId: user.id, action: 'auth.password.reset.request', entity: 'user', entityId: user.id, ip });
  }

  async resetPassword(dto: ResetPasswordInput, ip?: string): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { passwordResetToken: hashToken(dto.token) } });
    if (!user || isExpired(user.passwordResetExpires)) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
    const passwordHash = await bcrypt.hash(dto.password, Number(process.env.BCRYPT_ROUNDS ?? 10));
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordResetToken: null, passwordResetExpires: null },
    });
    // Force re-authentication on all devices.
    await this.prisma.refreshToken.updateMany({ where: { userId: user.id }, data: { revoked: true } });
    await this.audit.record({ actorId: user.id, action: 'auth.password.reset', entity: 'user', entityId: user.id, ip });
  }

  async verifyEmail(dto: VerifyEmailInput, ip?: string): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { emailVerifyToken: hashToken(dto.token) } });
    if (!user || isExpired(user.emailVerifyExpires)) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifyToken: null, emailVerifyExpires: null },
    });
    await this.audit.record({ actorId: user.id, action: 'auth.email.verify', entity: 'user', entityId: user.id, ip });
  }

  async resendVerification(dto: ResendVerificationInput, ip?: string): Promise<void> {
    const user = await this.users.findByEmail(dto.email);
    if (!user || user.emailVerified) return;
    const token = generateToken();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifyToken: hashToken(token), emailVerifyExpires: tokenExpiry(EMAIL_VERIFY_TTL) },
    });
    await this.notifications.send({
      channel: 'EMAIL',
      to: user.email,
      subject: 'Verify your SERVANA email',
      body: `Verify your email: ${this.appUrl()}/verify-email?token=${token}`,
      templateKey: 'email.verify',
      userId: user.id,
    });
  }

  async changePassword(userId: string, dto: ChangePasswordInput, ip?: string): Promise<void> {
    await this.users.changePassword(userId, dto.currentPassword, dto.password);
    await this.prisma.refreshToken.updateMany({ where: { userId }, data: { revoked: true } });
    await this.audit.record({ actorId: userId, action: 'user.password.change', entity: 'user', entityId: userId, ip });
  }

  async changeEmail(userId: string, dto: ChangeEmailInput, ip?: string): Promise<void> {
    const newEmail = await this.users.changeEmail(userId, dto.password, dto.email);
    if (!newEmail) return;
    const token = generateToken();
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifyToken: hashToken(token), emailVerifyExpires: tokenExpiry(EMAIL_VERIFY_TTL) },
    });
    await this.notifications.send({
      channel: 'EMAIL',
      to: newEmail,
      subject: 'Verify your new SERVANA email',
      body: `Verify your new email: ${this.appUrl()}/verify-email?token=${token}`,
      templateKey: 'email.verify',
      userId: userId,
    });
    await this.audit.record({ actorId: userId, action: 'user.email.change', entity: 'user', entityId: userId, ip });
  }

  private async issueTokens(sub: string, email: string, roles: string[]): Promise<TokenPair> {
    const accessToken = this.jwt.sign(
      { sub, email, roles },
      { secret: this.accessSecret, expiresIn: Number(process.env.JWT_ACCESS_TTL ?? 900) },
    );
    const refreshToken = this.jwt.sign(
      { sub, email, roles },
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
    return createHash('sha256').update(token).digest('hex');
  }
}
