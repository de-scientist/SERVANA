export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface AiRequest {
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AiResponse {
  text: string;
  model: string;
  provider: string;
}

export interface ModerationResult {
  safe: boolean;
  flaggedCategories: string[];
}

/**
 * Vendor-agnostic AI contract. No domain or UI code calls an LLM SDK directly;
 * it goes through this interface so providers (OpenAI/Anthropic/local) are swappable.
 */
export interface AiProvider {
  readonly id: string;
  complete(req: AiRequest): Promise<AiResponse>;
  moderate(text: string): Promise<ModerationResult>;
  embed(text: string): Promise<number[]>;
}
