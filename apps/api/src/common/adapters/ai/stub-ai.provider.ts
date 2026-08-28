import { Injectable } from '@nestjs/common';
import { AiProvider, AiRequest, AiResponse, ModerationResult } from './ai.provider';

@Injectable()
export class StubAiProvider implements AiProvider {
  readonly id = 'stub';

  async complete(_req: AiRequest): Promise<AiResponse> {
    return {
      text: '[stub] AI response — configure a real provider to enable intelligence.',
      model: 'stub-0',
      provider: this.id,
    };
  }

  async moderate(_text: string): Promise<ModerationResult> {
    return { safe: true, flaggedCategories: [] };
  }

  async embed(text: string): Promise<number[]> {
    // Deterministic placeholder embedding (not semantically meaningful).
    const vec = new Array(8).fill(0);
    for (let i = 0; i < text.length; i++) vec[i % 8] += text.charCodeAt(i);
    return vec;
  }
}
