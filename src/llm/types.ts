export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

export interface LlmResponse {
  text: string;
  promptTokens: number;
  completionTokens: number;
  /** Hidden reasoning tokens reported by the provider (0 when none). Billed, invisible in `text`. */
  reasoningTokens?: number;
  /** 'stop' | 'length' | ... ; 'length' means the output was truncated at max_tokens. */
  finishReason?: string | null;
  costUsd: number;
  latencyMs: number;
  model: string;
  generationId?: string;
}

export interface LlmClient {
  chat(model: string, messages: ChatMessage[], opts?: { maxTokens?: number }): Promise<LlmResponse>;
}
