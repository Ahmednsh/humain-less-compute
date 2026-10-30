export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

export interface LlmResponse {
  text: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  latencyMs: number;
  model: string;
  generationId?: string;
}

export interface LlmClient {
  chat(model: string, messages: ChatMessage[], opts?: { maxTokens?: number }): Promise<LlmResponse>;
}
