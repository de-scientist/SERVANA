import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_PROVIDER, StorageProvider } from './storage.provider';
import { StubStorageProvider } from './stub-storage.provider';

@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      useFactory: (_config: ConfigService): StorageProvider => new StubStorageProvider(),
      inject: [ConfigService],
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
