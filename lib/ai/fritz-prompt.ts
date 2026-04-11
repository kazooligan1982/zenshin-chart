/**
 * Shared Fritz-aware prompt fragments for AI flows that create chart proposals.
 *
 * Source of truth for the underlying principles: ~/knowledge-base/fritz/wiki/
 * (not bundled at runtime — distilled rules are duplicated here intentionally
 * so they ship in production). Key references:
 *   - concepts/advancing-structure.md
 *   - concepts/oscillating-structure.md
 *   - concepts/current-reality.md
 *   - concepts/start-with-nothing.md
 *   - guides/how-to-build-structural-tension-chart.md
 *   - guides/diagnosing-oscillation.md
 *   - guides/coaching-questions-fritz-style.md
 *
 * These rules are already enforced inline by CHAT_SYSTEM_PROMPT_JA in
 * app/api/ai/coach/route.ts. This module exists so proposal-generating
 * routes (structurize, tool-sync, claude-chat, manual, etc.) can apply the
 * SAME Fritz constraints without copy-paste drift. When coach/route.ts or
 * this module changes, keep the terminology map and diagnosis enum in sync.
 *
 * Contract:
 *   - Generated proposal items MUST respect the terminology map (Japanese).
 *   - `create_action` items MUST describe motion toward a Vision, never a
 *     reactive response to a problem / symptom / fear.
 *   - `create_tension` items MUST be framed as a structural gap between a
 *     Vision and a current Reality — not a lament or a complaint.
 *   - The proposal's `metadata.structural_diagnosis` MUST be set to one of
 *     `advancing` | `oscillating` | `unclear`, together with a short
 *     `reasoning` string. `oscillating` diagnoses should also name the
 *     conflict pattern when possible.
 */

export const FRITZ_STRUCTURAL_DIAGNOSIS_VALUES = [
  "advancing",
  "oscillating",
  "unclear",
] as const;

export type FritzStructuralDiagnosis =
  (typeof FRITZ_STRUCTURAL_DIAGNOSIS_VALUES)[number];

/**
 * Japanese terminology rules — identical to CHAT_SYSTEM_PROMPT_JA in
 * coach/route.ts. Do not translate freely; use these exact mappings.
 */
export const FRITZ_TERMINOLOGY_RULES_JA = `【用語統一ルール（日本語応答時は必須）】
以下の用語は必ずこの日本語訳を使用すること。括弧内の訳語は使用禁止。
- oscillating structure → 葛藤構造（×振動パターン、×振動構造、×発振構造）
- advancing structure → 前進構造（×前進パターン）
- structural tension → 構造的緊張（×構造的テンション）
- structural conflict → 構造的葛藤
- current reality → 現状（×現在の現実）
- tension-resolution system → 緊張解消システム
- dominant structure → 支配的構造
- hierarchy of importance → 重要性の階層
- primary choice → 第一の選択
- path of least resistance → 最小抵抗経路
- conflict pattern → 葛藤パターン`;

export const FRITZ_TERMINOLOGY_RULES_EN = `【Terminology Rules (required when responding in Japanese)】
Always use these exact Japanese translations. Terms in parentheses are forbidden.
- oscillating structure → 葛藤構造 (NOT 振動パターン, 振動構造, 発振構造)
- advancing structure → 前進構造 (NOT 前進パターン)
- structural tension → 構造的緊張 (NOT 構造的テンション)
- structural conflict → 構造的葛藤
- current reality → 現状 (NOT 現在の現実)
- tension-resolution system → 緊張解消システム
- dominant structure → 支配的構造
- hierarchy of importance → 重要性の階層
- primary choice → 第一の選択
- path of least resistance → 最小抵抗経路
- conflict pattern → 葛藤パターン`;

/**
 * Additional constraints specifically for AI flows that emit proposal items
 * (create_action / create_tension / update_action_status). Intended to be
 * prepended to the caller's system prompt together with the terminology
 * rules above.
 */
export const FRITZ_PROPOSAL_VALIDATION_JA = `【Proposal生成時のFritz原則（必須）】
提案（Proposal）を生成するときは、以下の Robert Fritz の構造思考原則を
必ず適用すること。違反する項目は生成しないか、生成前に書き換えること。

1. create_action（新規Action提案）
   - その Action が Vision に向かう動きになっているか検証する。
   - 問題・症状・恐れへの反応的行動（reactive）は提案しない。
     例: 「クレームが増えているので対応窓口を増やす」は症状対応 → 不可。
         「顧客が安心して相談できている状態」へ向けた具体策に書き換える。
   - Action は具体的で実行可能（誰が / 何を / いつまでに）であること。
   - 既存の tension_id が指定されているか、その Action を包む Tension を
     create_tension として同じ Proposal に含めること。

2. create_tension（新規Tension提案）
   - Tension は Vision と Reality のギャップとして表現する。
     不適: 「売上が足りない」「人手不足」「忙しい」（Reality の不満のみ）
     適:   「（Visionに向けた）〜が実現できていない」（構造的ギャップ）
   - できる限り vision_ids / reality_ids で紐づけ先を明示する。
   - 愚痴・嘆き・責任転嫁の表現は使わない。

3. update_action_status（ステータス変更提案）
   - 変更理由 (note) を必ず短く添える（事実ベース、主観的評価を避ける）。

4. metadata.structural_diagnosis（必須）
   - すべての AI 生成 Proposal は metadata.structural_diagnosis を含める:
       { "type": "advancing" | "oscillating" | "unclear",
         "conflict_pattern"?: string | null,
         "reasoning": string }
   - 前進構造 (advancing) と判断した場合は reasoning に根拠を 1〜2 行で。
   - 葛藤構造 (oscillating) と判断した場合は conflict_pattern に
     具体的なパターン名を入れる（例: 「アメとムチの交代」「罪悪感と反発の振動」）。
   - 判定できない場合は unclear を選び、不足している情報を reasoning に書く。
   - 用語は必ず「葛藤構造 / 前進構造 / 構造的緊張 / 現状」を使うこと。`;

export const FRITZ_PROPOSAL_VALIDATION_EN = `【Fritz principles for Proposal generation (required)】
When you emit proposal items, apply these Robert Fritz structural-thinking
principles. Items that violate them must be rewritten or dropped.

1. create_action
   - Verify the Action is motion toward a Vision. Reject reactive responses
     to problems, symptoms, or fears.
   - Actions must be concrete and executable (who / what / by when).
   - Either reference an existing tension_id, or include a create_tension
     item for the tension this Action belongs under.

2. create_tension
   - A Tension must be framed as the gap between Vision and Reality —
     NOT a complaint, lament, or blame. Prefer references via vision_ids /
     reality_ids when they are known.

3. update_action_status
   - Always include a short fact-based note explaining why the status
     changed.

4. metadata.structural_diagnosis (required)
   - Every AI-generated Proposal MUST carry:
       { "type": "advancing" | "oscillating" | "unclear",
         "conflict_pattern"?: string | null,
         "reasoning": string }
   - For "oscillating", name the conflict pattern when possible.
   - For "unclear", list the missing information in "reasoning".
   - Use the canonical Japanese terms when writing reasoning in Japanese.`;

/**
 * Compose the Fritz-aware preamble that proposal-generating AI flows should
 * prepend to their existing system prompt.
 */
export function buildFritzProposalPreamble(locale: "ja" | "en"): string {
  return locale === "en"
    ? `${FRITZ_TERMINOLOGY_RULES_EN}\n\n${FRITZ_PROPOSAL_VALIDATION_EN}`
    : `${FRITZ_TERMINOLOGY_RULES_JA}\n\n${FRITZ_PROPOSAL_VALIDATION_JA}`;
}

/**
 * Runtime guard for proposal metadata: returns true if the object looks like
 * a valid structural_diagnosis payload. Used by proposal write paths that
 * want to enforce the contract without coupling to a full validator.
 */
export function isValidStructuralDiagnosis(
  value: unknown
): value is {
  type: FritzStructuralDiagnosis;
  reasoning: string;
  conflict_pattern?: string | null;
  hierarchy_selected?: boolean;
} {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.type === "string" &&
    (FRITZ_STRUCTURAL_DIAGNOSIS_VALUES as readonly string[]).includes(v.type) &&
    typeof v.reasoning === "string"
  );
}
