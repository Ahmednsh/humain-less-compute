import type { Row } from '../data/db.js';
import type { Answer } from '../tasks/types.js';

export type CallPurpose = 'generate' | 'repair' | 'verify';
export interface CallRecord {
  purpose: CallPurpose;
  model: string;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  finishReason: string | null;
  costUsd: number;
  latencyMs: number;
}
export interface AttemptResult {
  tier: 'small' | 'large';
  sql: string | null;
  answerShape: 'scalar' | 'list';
  confidence: number;
  rows: Row[] | null;
  answer: Answer | null;
  error: string | null;
  repairs: number;
  calls: CallRecord[];
}
export const sumCalls = (calls: CallRecord[]) => ({
  promptTokens: calls.reduce((s, c) => s + c.promptTokens, 0),
  completionTokens: calls.reduce((s, c) => s + c.completionTokens, 0),
  costUsd: calls.reduce((s, c) => s + c.costUsd, 0),
  latencyMs: calls.reduce((s, c) => s + c.latencyMs, 0),
});
