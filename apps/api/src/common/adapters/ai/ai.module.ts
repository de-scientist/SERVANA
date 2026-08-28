import { Inject, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_PROVIDER, AiProvider } from './ai.provider';
import { StubAiProvider } from './stub-ai.provider';

@Module({
  providers: [
    {
      provide: AI_PROVIDER,
      useFactory: (config: ConfigService): AiProvider => new StubAiProvider(),
      inject: [ConfigService],
    },
  ],
  exports: [AI_PROVIDER],
})
export class AiModule {}
