type Diff = { added: any[]; changed: { id: string; fields: string[] }[]; removed: any[]; reordered: boolean };
export function importSheet(input: {
  wordsCsv: string;
  topicsCsv?: string;
  currentWords: any[];
  currentTopics: any[];
  allowRemovals?: boolean;
}): {
  words: any[];
  topics: any[];
  wordDiff: Diff;
  topicDiff: Diff;
  errors: string[];
  warnings: string[];
  removals: string[];
  blockedRemovals: boolean;
  changed: boolean;
  summary: string;
};
