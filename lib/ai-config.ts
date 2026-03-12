// AI Model Configuration
// PRIMARY: 壁打ち・分析など高品質な応答が必要なモード
// LIGHT: 構造化・抽出などフォーマット遵守が重要なモード

export const AI_MODEL = {
  PRIMARY: process.env.AI_MODEL_PRIMARY || "claude-sonnet-4-5",
  LIGHT: process.env.AI_MODEL_LIGHT || "claude-sonnet-4-20250514",
} as const;

export const AI_MAX_TOKENS = {
  chat: 500,
  analyze: 4000,
  structurize: 4000,
  extract_vrta: 2000,
  snapshot_analyze: 4000,
  comparison_analyze: 4000,
  slack_weekly: 500,
} as const;
