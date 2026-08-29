import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditModule } from '../audit/audit.module';
import { ProvidersModule } from '../providers/providers.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [UsersModule, RbacModule, AuditModule, ProvidersModule],
  controllers: [AdminController],
})
export class AdminModule {}
