export type AnswerType = 'number' | 'string' | 'list' | 'ordered_list';
export type Answer = number | string | (string | number)[];
export type Tier = 1 | 2 | 3;
export type Lang = 'en' | 'ar';

export interface Task {
  id: string;
  templateId: string;
  /** Difficulty tier: analysis only. Never shown to the agent. */
  tier: Tier;
  lang: Lang;
  question: string;
  goldSql: string;
  gold: Answer;
  answerType: AnswerType;
  moneyAggregate: boolean;
}
