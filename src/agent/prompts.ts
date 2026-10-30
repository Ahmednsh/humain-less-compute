import type { AgentContext } from './context.js';
import type { ChatMessage } from '../llm/types.js';

export function systemPrompt(ctx: AgentContext): string {
  const glossary = ctx.glossary ? `\n\nBusiness definitions:\n${ctx.glossary}` : '';
  return `You are a senior SQLite analyst. Answer the user's question by writing ONE read-only SQLite query against the schema below. Use only these tables and columns.${glossary}

Schema:
${ctx.ddl}

Rules:
- Put the answer in the FIRST column of the result. Return exactly one row for a single-value answer; one row per item for a list.
- Round monetary sums to 2 decimals. Order rankings explicitly and use LIMIT for "top N".
- Never modify data. No comments, no explanations.
- Return ONLY a JSON object with this shape and nothing else:
{"sql": "<the SQL>", "answer_shape": "scalar" | "list", "confidence": <0..1 how sure you are the SQL answers the question exactly>}`;
}

export function fewshotMessages(ctx: AgentContext): ChatMessage[] {
  return ctx.fewshots.flatMap(f => [
    { role: 'user' as const, content: f.q },
    { role: 'assistant' as const, content: JSON.stringify({ sql: f.sql, answer_shape: /^SELECT COUNT|AS n\b|AS revenue|AS avg|LIMIT 1$/.test(f.sql) && !/LIMIT [2-9]/.test(f.sql) ? 'scalar' : 'list', confidence: 0.95 }) },
  ]);
}

export function repairPrompt(error: string): string {
  return `That query failed: ${error}\nReturn a corrected JSON object with the same shape. Only the JSON.`;
}

export function emptyResultPrompt(): string {
  return 'That query returned no rows. Re-check the filters, joins and spelling of values (statuses, names, dates), then return a corrected JSON object. Only the JSON.';
}

export function verifyPrompt(ctx: AgentContext, question: string, sql: string, rowsPreview: string): string {
  return `You are reviewing another analyst's SQLite query for the question below. Decide whether the SQL answers the question exactly, given the schema and definitions.

Business definitions:
${ctx.glossary || '(none)'}

Schema:
${ctx.ddl}

Question: ${question}

SQL under review:
${sql}

First rows of its result:
${rowsPreview}

Return ONLY a JSON object: {"verdict": "correct" | "incorrect", "corrected_sql": <string or null>, "reason": "<one sentence>"}. Provide corrected_sql only when the verdict is incorrect and you are confident in the fix.`;
}
