import { Inject, Injectable } from '@nestjs/common';
import { AI_PROVIDER, AiProvider } from '../../common/adapters/ai/ai.provider';
import { screenInjection } from './guardrails';

export interface ModerationVerdict {
  safe: boolean;
  categories: string[];
}

/**
 * Two-layer moderation: vendor classifier + local prompt-injection screen.
 * Deterministic and safe to run on user content (reviews, messages, briefs).
 */
@Injectable()
export class ModerationService {
  constructor(@Inject(AI_PROVIDER) private readonly provider: AiProvider) {}

  async moderate(text: string): Promise<ModerationVerdict> {
    const clean = text?.trim() ?? '';
    if (!clean) return { safe: false, categories: ['empty'] };
    if (clean.length > 8000) return { safe: false, categories: ['too-long'] };

    const [vendor, injection] = await Promise.all([
      this.provider.moderate(clean).catch(() => ({ safe: true, flaggedCategories: [] as string[] })),
      Promise.resolve(screenInjection(clean)),
    ]);

    const categories = [...(vendor.flaggedCategories ?? [])];
    if (injection.flagged) categories.push('prompt-injection');
    return { safe: vendor.safe !== false && !injection.flagged, categories };
  }
}
