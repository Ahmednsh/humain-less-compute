export type { Template, TemplateInstance } from './shared.js';
import type { Template } from './shared.js';
import { TIER1 } from './tier1.js';
import { TIER2 } from './tier2.js';
import { TIER3 } from './tier3.js';
import { HOLDOUT } from './holdout.js';

export const ALL_TEMPLATES: Template[] = [...TIER1, ...TIER2, ...TIER3, ...HOLDOUT];
export const DEV_TEMPLATES: Template[] = ALL_TEMPLATES.filter(t => !t.holdoutOnly);
