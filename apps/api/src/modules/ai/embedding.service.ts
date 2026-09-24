import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AI_PROVIDER, AiProvider } from '../../common/adapters/ai/ai.provider';
import { stripPiiText, estimateTokens } from './guardrails';

/** Provider-agnostic embeddings over PII-stripped text. */
@Injectable()
export class EmbeddingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
  ) {}

  async embed(
    input: { actorId?: string | null; feature?: string; text: string },
  ): Promise<{ vector: number[]; model: string }> {
    const clean = stripPiiText(input.text?.trim() ?? '');
    if (!clean) throw new Error('Cannot embed empty text');
    if (clean.length > 8000) throw new Error('Embed text too long (max 8000 chars)');
    const vector = await this.provider.embed(clean.slice(0, 8000));
    try {
      await this.prisma.aiRequestLog.create({
        data: {
          actorId: input.actorId ?? null,
          feature: input.feature ?? 'embedding',
          provider: this.provider.id,
          model: `${this.provider.id}-embed`,
          inputTokens: estimateTokens(clean),
          outputTokens: 0,
          costCents: 0n,
          status: 'OK',
        },
      });
    } catch {
      // logging is best-effort
    }
    return { vector, model: `${this.provider.id}-embed` };
  }
}
