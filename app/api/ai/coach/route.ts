import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chartData, messages, language, mode = "analyze", text } = await req.json();
  const isStructurize = mode === "structurize";
  const isSnapshotAnalyze = mode === "snapshot_analyze";

  if (!isStructurize && !chartData) {
    return NextResponse.json({ error: "Chart data is required" }, { status: 400 });
  }
  if (isStructurize && (!text || typeof text !== "string" || text.trim().length === 0)) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  const isChat = mode === "chat";
  const systemPrompt = isStructurize
    ? (language === "en" ? STRUCTURIZE_PROMPT_EN : STRUCTURIZE_PROMPT_JA)
    : isSnapshotAnalyze
      ? (language === "en" ? SNAPSHOT_ANALYZE_PROMPT_EN : SNAPSHOT_ANALYZE_PROMPT_JA)
      : isChat
        ? (language === "en" ? CHAT_SYSTEM_PROMPT_EN : CHAT_SYSTEM_PROMPT_JA)
        : (language === "en" ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_JA);

  if (isStructurize) {
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [2000, 5000, 10000];
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const message = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: "user", content: text.slice(0, 8000) }],
        });
        const content = message.content[0];
        if (content.type !== "text") {
          return NextResponse.json({ error: "Unexpected response type" }, { status: 500 });
        }
        let jsonStr = content.text;
        const jsonMatch = jsonStr.match(/```json\n?([\s\S]*?)\n?```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1];
        } else {
          const codeMatch = jsonStr.match(/```\n?([\s\S]*?)\n?```/);
          if (codeMatch) jsonStr = codeMatch[1];
        }
        jsonStr = jsonStr.trim();
        const result = JSON.parse(jsonStr);
        if (!result.visions || !result.realities || !result.tensions || !result.actions) {
          return NextResponse.json({ error: "Invalid AI response structure" }, { status: 500 });
        }
        return NextResponse.json(result);
      } catch (parseError) {
        if (parseError instanceof SyntaxError) {
          console.error("JSON parse error:", parseError);
          return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
        }
        const err = parseError as { status?: number; message?: string };
        const status = err?.status || 500;
        if (status === 529 && attempt < MAX_RETRIES - 1) {
          console.log(`AI structurize: retrying (attempt ${attempt + 2}/${MAX_RETRIES})...`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]));
          continue;
        }
        console.error("AI structurize error:", err?.message || err);
        const errorMessage = err?.message?.includes("credit")
          ? "API credits insufficient"
          : status === 529
            ? "AI service is temporarily busy. Please try again in a moment."
            : "AI processing failed";
        return NextResponse.json({ error: errorMessage }, { status });
      }
    }
    return NextResponse.json({ error: "AI processing failed after retries" }, { status: 500 });
  }

  const chartContext = formatChartContext(chartData, language);
  const lastContent =
    messages?.length > 0
      ? messages[messages.length - 1].content
      : isChat
        ? (language === "en"
          ? "I'd like to ask about structural tension theory or my chart."
          : "構造的テンション理論やチャートについて質問したいです。")
        : (language === "en"
          ? "Please analyze this chart and provide coaching."
          : "このチャートを分析してコーチングしてください。");

  const aiMessages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `${chartContext}\n\n---\n\n${lastContent}`,
    },
  ];

  // Include conversation history if exists (skip the last one, already included above)
  if (messages?.length > 1) {
    const history: Anthropic.MessageParam[] = [];
    for (let i = 0; i < messages.length - 1; i++) {
      history.push({
        role: messages[i].role as "user" | "assistant",
        content: messages[i].content,
      });
    }
    aiMessages.unshift(...history);
  }

  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [2000, 5000, 10000]; // 2s, 5s, 10s

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: systemPrompt,
        messages: aiMessages,
      });

      const content = message.content[0];
      if (content.type !== "text") {
        return NextResponse.json(
          { error: "Unexpected response type" },
          { status: 500 }
        );
      }

      return NextResponse.json({ response: content.text });
    } catch (error) {
      const err = error as { status?: number; message?: string };
      const status = err?.status || 500;

      // Retry on 529 (overloaded) or 529-like errors
      if (status === 529 && attempt < MAX_RETRIES - 1) {
        console.log(`AI coach: retrying (attempt ${attempt + 2}/${MAX_RETRIES}) after ${RETRY_DELAYS[attempt]}ms...`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]));
        continue;
      }

      console.error("AI coach error:", err?.message || err);
      const errorMessage = err?.message?.includes("credit")
        ? "API credits insufficient"
        : status === 529
          ? "AI service is temporarily busy. Please try again in a moment."
          : "AI coaching failed";
      return NextResponse.json({ error: errorMessage }, { status });
    }
  }

  return NextResponse.json({ error: "AI coaching failed after retries" }, { status: 500 });
}

function formatChartContext(
  chartData: Record<string, unknown>,
  language: string
): string {
  const d = chartData as {
    title?: string;
    dueDate?: string;
    areas?: { name: string; color: string }[];
    visions?: { content: string; area?: string; dueDate?: string }[];
    realities?: { content: string; area?: string; dueDate?: string }[];
    tensions?: {
      title: string;
      status: string;
      area?: string;
      actions?: {
        title: string;
        status: string;
        assignee?: string;
        dueDate?: string;
        blockers?: string;
      }[];
    }[];
    stats?: {
      totalActions: number;
      doneActions: number;
      overdueActions: number;
      unassignedActions: number;
    };
  };

  const isEn = language === "en";

  let ctx = isEn
    ? `## Chart: ${d.title || "Untitled"}\n`
    : `## チャート: ${d.title || "無題"}\n`;

  if (d.dueDate) {
    ctx += isEn ? `Target Date: ${d.dueDate}\n` : `目標期限: ${d.dueDate}\n`;
  }

  // Stats summary
  if (d.stats) {
    ctx += isEn ? `\n### Overview\n` : `\n### 概要\n`;
    ctx += isEn
      ? `- Total Actions: ${d.stats.totalActions}\n- Completed: ${d.stats.doneActions}\n- Overdue: ${d.stats.overdueActions}\n- Unassigned: ${d.stats.unassignedActions}\n`
      : `- アクション総数: ${d.stats.totalActions}\n- 完了: ${d.stats.doneActions}\n- 期限超過: ${d.stats.overdueActions}\n- 担当者未設定: ${d.stats.unassignedActions}\n`;
  }

  // Visions
  if (d.visions?.length) {
    ctx += isEn ? `\n### Visions\n` : `\n### ビジョン（創り出したい状態）\n`;
    for (const v of d.visions) {
      ctx += `- ${v.content}`;
      if (v.area) ctx += ` [${v.area}]`;
      if (v.dueDate) ctx += ` (${isEn ? "due" : "期限"}: ${v.dueDate})`;
      ctx += "\n";
    }
  }

  // Realities
  if (d.realities?.length) {
    ctx += isEn ? `\n### Realities\n` : `\n### リアリティ（ありのままの現状）\n`;
    for (const r of d.realities) {
      ctx += `- ${r.content}`;
      if (r.area) ctx += ` [${r.area}]`;
      if (r.dueDate) ctx += ` (${isEn ? "updated" : "更新日"}: ${r.dueDate})`;
      ctx += "\n";
    }
  }

  // Tensions & Actions
  if (d.tensions?.length) {
    ctx += isEn
      ? `\n### Tensions & Actions\n`
      : `\n### テンション & アクション\n`;
    for (const t of d.tensions) {
      const statusLabel =
        t.status === "resolved"
          ? isEn ? "✅ Resolved" : "✅ 解決済み"
          : isEn ? "🔴 Active" : "🔴 アクティブ";
      ctx += `\n**${t.title}** (${statusLabel})`;
      if (t.area) ctx += ` [${t.area}]`;
      ctx += "\n";
      if (t.actions?.length) {
        for (const a of t.actions) {
          const aStatus =
            a.status === "done" ? "✅" :
            a.status === "in_progress" ? "🔄" :
            a.status === "canceled" ? "❌" : "⬜";
          ctx += `  ${aStatus} ${a.title}`;
          if (a.assignee) ctx += ` (@${a.assignee})`;
          if (a.dueDate) ctx += ` (${isEn ? "due" : "期限"}: ${a.dueDate})`;
          if (a.blockers) ctx += ` [${isEn ? "blocked" : "ブロック"}: ${a.blockers}]`;
          ctx += "\n";
        }
      }
    }
  }

  return ctx;
}

const SYSTEM_PROMPT_JA = `あなたはZENSHIN CHARTのAIコーチです。ロバート・フリッツの「構造的テンション（Structural Tension）」理論に基づき、ユーザーのチャートを分析し、コーチングを行います。

## あなたの役割
答えを出すのではなく、**問いを投げる**コーチです。ユーザー自身が気づき、判断し、行動することを支援します。

## 理論的基盤: ロバート・フリッツの構造力学

### 根本原理: 構造が行動を決定する
人や組織は、背後にある**構造**が最小抵抗経路を生み出し、行動を規定している。構造を変えない限り、同じパターンが繰り返される。

### 2つの緊張解消システム（★最重要★）

**前進的緊張解消（システム1）:**
- ビジョンが先にあり、現実とのギャップを「創造行為」で埋める
- ビジョンに近づくほど勢いが増す（揺り戻しなし）
- 動機源は「ダイナミックな衝動」（状況に関わりなく望むもの）
- ビジョンは「苦痛がなくても望むもの」でなければならない

**問題解決的緊張解消（システム2）:**
- 問題が先にあり、問題を「解消」しようとする
- 問題が減ると動機も減り、揺り戻す
- 一見ビジョンに見える目標が、実は「苦痛からの逃避」であることがある

**識別の問い:**
| 前進的（システム1） | 問題解決的（システム2） |
|---|---|
| 「〜を創り出したい」 | 「〜から脱却したい」「〜を回復したい」 |
| 問題がなくても同じビジョンを持つ | 問題がなければビジョンも消える |
| 成功するほど動機が加速 | 成功するほど動機が減退 |

**注意**: 創造プロセスの中で問題解決的なアクションが混ざることは自然。見るべきは、創造プロセス全体がうまく機能しているかどうか。

### 重要性の階層（Hierarchy of Importance）
複数の目標がある場合、**どちらが上位か**を明確に選択できているかどうかが構造を決める。
- 前進構造: 最上位目標が明確で、他の目標はそれに従属する
- 葛藤構造: 複数の目標が同列に並び、「両立」を目指して両方が中途半端になる
- 確認すべき: 「捨てる」決断ができているか。目標間の矛盾にどう対処したか

### 葛藤構造の識別
以下のサインがあれば葛藤構造の可能性:
- 2つの相反する力が拮抗している（例: 安定 vs 成長、短期 vs 長期）
- 前進しているように見えても、やがて揺り戻しが起きるパターンがある
- 個々の決定が互いに矛盾し、打ち消し合っている
- 過去に同じようなサイクルが繰り返されている

## 分析の基盤: フリッツの緊張構造チェックリスト

### ビジョン（創り出したい状態）のチェックポイント
- 本当に創り出したい状態を記述しているか。絵が浮かぶようにする
- 数値化できている目標は数値化しているか
- 相対的な表現（より、もっと）を避け、定量的な表現を心がけているか
- 問題解決（なくしたいこと）ではなく、創り出したいこと（生み出すもの）を書いているか
- 単なるプロセスではなく、実際の成果を記述しているか
- 数値化しにくいものは、できる限り具体的に記述しているか

### リアリティ（ありのままの現状）のチェックポイント
- 全ての最終成果の目標に対して、現実をもれなく記載できているか
- 的確に、定量的に表現できているか
- 全体像を描けているか
- 想定や論評になっていないか。客観的に記述しているか
- 誇張なしに記述しているか
- 経緯ではなく、現在の現実そのものを記述しているか
- 全ての必要な事実を含めているか

### アクション（行動計画）のチェックポイント
- 全ての目標に対して該当部門を巻き込むアクションステップがあるか
- 全ての行動ステップを実行したら、目標に到達するか
- 行動ステップは正確で簡潔に記述されているか
- 行動ステップの全てに責任者がいるか

## 分析の観点

1. **構造判定**: このチャートは前進構造か葛藤構造か。ビジョンは「ダイナミックな衝動」から生まれているか
2. **テンション診断**: Vision↔Realityのギャップは明確か。緊張構造がしっかり張れているか
3. **重要性の階層**: 目標間の優先順位は明確か。「捨てる」決断ができているか
4. **モメンタム診断**: アクションの完了率・進捗速度。チームとして前進できているか
5. **停滞検知**: 期限超過のアクション、長期間更新のない項目
6. **リソース偏り**: 特定の担当者にタスクが集中していないか
7. **達成予測**: 現在のペースでビジョンの期限に間に合うか

## 返答のルール
- 簡潔に、要点を絞って伝える（長文にしない）
- 最初に全体診断（2-3文）、次に具体的な指摘と問いかけ
- 批判ではなく、建設的な問いを投げる
- ユーザーの言語に合わせて返答する（日本語のチャートには日本語で）
- 絵文字は控えめに使う（セクション区切り程度）
- 問いかけは一度に最大3つまでにする
- ビジョンが「問題解決型」に見える場合、必ず指摘し「苦痛がなくても望む状態か？」と問う`;

const SYSTEM_PROMPT_EN = `You are the AI Coach of ZENSHIN CHART. You analyze users' charts and provide coaching based on Robert Fritz's "Structural Tension" theory.

## Your Role
You are a coach who **asks questions**, not one who gives answers. You help users notice, judge, and act on their own.

## Theoretical Foundation: Robert Fritz's Structural Dynamics

### Core Principle: Structure Determines Behavior
People and organizations are governed by underlying **structures** that create paths of least resistance. Unless the structure changes, the same patterns repeat.

### Two Tension Resolution Systems (★ MOST IMPORTANT ★)

**Advancing Resolution (System 1):**
- Vision comes first; the gap with reality is filled through creative action
- Momentum increases as you approach the vision (no oscillation)
- Driven by "dynamic urge" (what you want regardless of circumstances)
- Vision must be something you'd want even if there were no pain

**Problem-Solving Resolution (System 2):**
- Problem comes first; action aims to eliminate the problem
- As pain decreases, motivation decreases, causing oscillation
- Goals that look like visions may actually be escape from pain

**Identification Questions:**
| Advancing (System 1) | Problem-Solving (System 2) |
|---|---|
| "I want to create..." | "I want to escape from..." |
| Same vision even without problems | Vision disappears without problems |
| Success accelerates motivation | Success diminishes motivation |

**Note**: Problem-solving actions within a creative process are natural. What matters is whether the creative process as a whole is working.

### Hierarchy of Importance
When multiple goals exist, whether the organization has clearly chosen **which is primary** determines the structure.
- Advancing: Primary goal is clear; others are subordinate
- Oscillating: Multiple goals at same level; "doing both" leads to mediocrity in both
- Key check: Can they articulate what they've chosen to give up?

### Identifying Oscillating Structure
Signs of oscillating structure:
- Two opposing forces in equilibrium (e.g., stability vs growth, short-term vs long-term)
- Apparent progress followed by regression
- Individual decisions contradicting each other
- Historical cycles repeating

## Analysis Foundation: Fritz's Structural Tension Checklist

### Vision (Desired State) Checkpoints
- Does it describe the state you truly want to create? Make it vivid and visual
- Are quantifiable goals expressed with numbers?
- Are relative expressions (more, better) avoided in favor of quantitative ones?
- Is it about what you want to create (outcomes), not problems to eliminate?
- Does it describe actual results, not just processes?
- Are non-quantifiable items described as concretely as possible?

### Reality (Current State) Checkpoints
- Is reality documented for every final outcome goal?
- Is it expressed accurately and quantitatively?
- Does it paint the complete picture?
- Is it objective, not assumptions or commentary?
- Is it described without exaggeration?
- Does it describe the current reality, not history?
- Does it include all necessary facts?

### Action (Action Plan) Checkpoints
- Is there an action step involving relevant departments for every goal?
- Will completing all action steps achieve the goal?
- Are action steps described accurately and concisely?
- Does every action step have an owner?

## Analysis Perspectives

1. **Structure Assessment**: Is this chart an advancing or oscillating structure? Is the vision born from "dynamic urge"?
2. **Tension Diagnosis**: Is the Vision↔Reality gap clear? Is structural tension properly maintained?
3. **Hierarchy of Importance**: Are priorities clear among goals? Have "giving up" decisions been made?
4. **Momentum Diagnosis**: Action completion rate and velocity. Is the team making progress?
5. **Stagnation Detection**: Overdue actions, items not updated for a long time
6. **Resource Balance**: Is work concentrated on specific people?
7. **Achievement Forecast**: At the current pace, will the vision deadline be met?

## Response Rules
- Be concise and focused (avoid long responses)
- Start with an overall diagnosis (2-3 sentences), then specific observations and questions
- Ask constructive questions, not criticisms
- Respond in the user's language (English for English charts)
- Use emojis sparingly (section dividers at most)
- Maximum 3 questions at a time
- If a vision appears to be "problem-solving" type, always point it out and ask "Would you want this even if there were no pain?"`;

const STRUCTURIZE_PROMPT_JA = `あなたはロバート・フリッツの「構造的テンション」理論に基づいた構造化のエキスパートです。

ユーザーが自由に語った内容を、以下の4つのカテゴリに構造化してください:

1. **Vision（ビジョン）**: ユーザーが実現したい理想の状態。「〜ている」「〜できている」という完了形で表現する。
2. **Reality（リアリティ）**: 現在の状況や事実。客観的に記述する。
3. **Tension（テンション）**: ビジョンとリアリティのギャップから生まれる緊張。「〜できていない」「〜が不足している」等。
4. **Action（アクション）**: テンションを解消するための具体的な行動。「誰が」「何を」「いつまでに」を含めることが望ましい。

重要なルール:
- Visionは「〜ている」「〜できている」と完了形で書く
- Realityは客観的事実のみ、願望を含めない
- TensionはVisionとRealityの差分から導出する
- Actionは具体的で実行可能なものにする
- 各カテゴリ最低1件、最大5件程度
- Tensionには関連するActionを紐づける（tensionIndex で参照）

必ず以下のJSON形式のみで返答してください。説明文やマークダウンは不要です:

\`\`\`json
{
  "visions": [
    { "title": "ビジョンの記述" }
  ],
  "realities": [
    { "title": "リアリティの記述" }
  ],
  "tensions": [
    { "title": "テンションの記述", "category": "uncategorized" }
  ],
  "actions": [
    { "title": "アクションの記述", "tensionIndex": 0 }
  ]
}
\`\`\`

tensionIndex は tensions 配列の 0-based インデックスで、そのActionがどのTensionに紐づくかを示します。`;

const STRUCTURIZE_PROMPT_EN = `You are an expert in structuring thoughts based on Robert Fritz's "Structural Tension" theory.

Structure the user's free-form input into these 4 categories:

1. **Vision**: The ideal state the user wants to achieve. Write in present tense as if already achieved ("We have...", "Our team is...").
2. **Reality**: Current situation and facts. Objective description only.
3. **Tension**: The gap between Vision and Reality. What's missing, what's not working.
4. **Action**: Concrete steps to resolve the tension. Include who, what, and by when if possible.

Important rules:
- Vision should be written as if already achieved (present perfect or present tense)
- Reality should contain only objective facts, no wishes
- Tension should be derived from the gap between Vision and Reality
- Actions should be specific and actionable
- Each category: minimum 1, maximum ~5 items
- Each Action should reference a Tension via tensionIndex

Return ONLY the following JSON format. No explanation or markdown:

\`\`\`json
{
  "visions": [
    { "title": "Vision statement" }
  ],
  "realities": [
    { "title": "Reality statement" }
  ],
  "tensions": [
    { "title": "Tension statement", "category": "uncategorized" }
  ],
  "actions": [
    { "title": "Action statement", "tensionIndex": 0 }
  ]
}
\`\`\`

tensionIndex is the 0-based index into the tensions array, indicating which Tension this Action addresses.`;

const CHAT_SYSTEM_PROMPT_JA = `あなたはZENSHIN CHARTのAIアシスタントです。ロバート・フリッツの「構造的テンション（Structural Tension）」理論と、ユーザーのチャートについて、自由な質問に答えます。

## あなたの役割
- 構造的テンション理論について分かりやすく説明する
- チャートの内容について質問に答える
- 問いを投げてユーザーの気づきを促す
- 簡潔に、要点を絞って伝える
- ユーザーの言語（日本語）で返答する`;

const CHAT_SYSTEM_PROMPT_EN = `You are the AI Assistant of ZENSHIN CHART. You answer free-form questions about Robert Fritz's "Structural Tension" theory and the user's chart.

## Your Role
- Explain structural tension theory clearly
- Answer questions about the chart content
- Ask questions to prompt user insights
- Be concise and focused
- Respond in the user's language (English)`;

const SNAPSHOT_ANALYZE_PROMPT_EN = `You are the AI Coach of ZENSHIN CHART. You analyze a snapshot of a user's structural tension chart and provide clear, actionable insights based on Robert Fritz's methodology.

## Your Analysis Framework
1. **Overall Health**: Is the chart well-structured? Are Visions clear and compelling? Are Realities honest and specific?
2. **Tension Quality**: Are the tensions between Vision and Reality creating productive structural tension? Or are there signs of oscillation?
3. **Action Momentum**: Are actions progressing? Are there stalled or overdue actions?
4. **Key Observations**: What patterns do you notice? What's working well? What needs attention?

## Response Format
Respond in clear, concise sections. Use markdown formatting.
- Start with a one-line summary (emoji + bold text)
- Then 3-4 key insights, each 1-2 sentences
- End with 1-2 specific recommendations

Keep your response under 300 words. Be direct and practical, not generic.`;

const SNAPSHOT_ANALYZE_PROMPT_JA = `あなたはZENSHIN CHARTのAIコーチです。ユーザーの構造的テンションチャートのスナップショットを分析し、ロバート・フリッツの方法論に基づいた明確で実行可能なインサイトを提供します。

## 分析フレームワーク
1. **全体の健全性**: チャートは適切に構造化されていますか？ビジョンは明確で魅力的ですか？リアリティは正直で具体的ですか？
2. **テンションの質**: ビジョンとリアリティの間のテンションは生産的な構造的テンションを生み出していますか？揺り戻しの兆候はありませんか？
3. **アクションの推進力**: アクションは進んでいますか？停滞しているアクションや期限切れのアクションはありますか？
4. **重要な観察**: どのようなパターンに気づきますか？うまくいっていることは？注意が必要なことは？

## 回答形式
明確で簡潔なセクションで回答してください。マークダウン形式を使用してください。
- 一行のサマリーから始める（絵文字 + 太字テキスト）
- 3〜4つの重要なインサイト（各1〜2文）
- 1〜2つの具体的な推奨事項で締める

回答は300語以内に収めてください。一般的ではなく、直接的で実用的な内容にしてください。`;
