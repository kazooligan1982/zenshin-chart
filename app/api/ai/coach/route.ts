import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { AI_MODEL, AI_MAX_TOKENS } from "@/lib/ai-config";
import { checkRateLimit, logAiUsage } from "@/lib/ai/rate-limit";
import { logger } from "@/lib/logger";

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

  const body = await req.json();
  const { chartData, messages, language, locale, mode = "analyze", text, initialContext, comparisonData } = body;

  // Rate limiting
  const wsId = body.workspace_id ?? null;
  const { allowed, reason } = await checkRateLimit(user.id, wsId, `coach/${mode}`);
  if (!allowed) {
    return NextResponse.json({ error: reason }, { status: 429 });
  }
  const isStructurize = mode === "structurize";
  const isSnapshotAnalyze = mode === "snapshot_analyze";
  const isComparisonAnalyze = mode === "comparison_analyze";
  const isExtractVrta = mode === "extract_vrta";

  if (!isStructurize && !isComparisonAnalyze && !isExtractVrta && !chartData) {
    return NextResponse.json({ error: "Chart data is required" }, { status: 400 });
  }
  if (isStructurize && (!text || typeof text !== "string" || text.trim().length === 0)) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }
  if (
    isComparisonAnalyze &&
    (!comparisonData ||
      !comparisonData.before ||
      !comparisonData.after ||
      !comparisonData.diff ||
      !comparisonData.summary)
  ) {
    return NextResponse.json({ error: "comparisonData is required with before, after, diff, summary" }, { status: 400 });
  }

  const isChat = mode === "chat";
  const isSnapshotEscalation =
    isChat &&
    initialContext?.type === "snapshot_escalation" &&
    initialContext?.analysisResult &&
    initialContext?.chartName;
  const isComparisonEscalation =
    isChat &&
    initialContext?.type === "comparison_escalation" &&
    initialContext?.analysisResult &&
    initialContext?.chartName;

  const lang = language || locale || "ja";
  const isEn = lang === "en";

  let systemPrompt = isStructurize
    ? (isEn ? STRUCTURIZE_PROMPT_EN : STRUCTURIZE_PROMPT_JA)
    : isSnapshotAnalyze
      ? (isEn ? SNAPSHOT_ANALYZE_PROMPT_EN : SNAPSHOT_ANALYZE_PROMPT_JA)
      : isComparisonAnalyze
        ? buildComparisonAnalyzeSystemPrompt(comparisonData, isEn)
        : isChat
          ? (isEn ? CHAT_SYSTEM_PROMPT_EN : CHAT_SYSTEM_PROMPT_JA)
          : (isEn ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_JA);

  if (isSnapshotEscalation) {
    const snapshotSummary = formatSnapshotSummary(initialContext.snapshotData, lang);
    const escalationBlock =
      lang === "ja"
        ? `\n\n## スナップショット分析の続き\nユーザーのチャート「${initialContext.chartName}」のスナップショットについて、以下の事前分析が行われています。\n\n【事前分析結果】\n${initialContext.analysisResult}\n\n【スナップショットデータ要約】\n${snapshotSummary}\n\nこの分析を踏まえて、ユーザーの質問に答えてください。より深い構造的テンションの洞察を提供し、具体的なアクション提案を行ってください。`
        : `\n\n## Continued from Snapshot Analysis\nA prior analysis has been performed on the user's chart "${initialContext.chartName}" snapshot.\n\n【Prior Analysis】\n${initialContext.analysisResult}\n\n【Snapshot Data Summary】\n${snapshotSummary}\n\nAnswer the user's questions based on this analysis. Provide deeper structural tension insights and concrete action recommendations.`;
    systemPrompt = systemPrompt + escalationBlock;
  }

  if (isComparisonEscalation) {
    const comparisonSummary = formatComparisonSummary(initialContext.comparisonData, lang);
    const escalationBlock =
      lang === "ja"
        ? `\n\n## スナップショット比較分析の続き\nユーザーのチャート「${initialContext.chartName}」の2つのスナップショットの比較について、以下の事前分析が行われています。\n\n【事前分析結果】\n${initialContext.analysisResult}\n\n【比較データ要約】\n${comparisonSummary}\n\nこの分析を踏まえて、ユーザーの質問に答えてください。より深い構造的テンションの洞察を提供し、具体的なアクション提案を行ってください。`
        : `\n\n## Continued from Snapshot Comparison Analysis\nA prior analysis has been performed on the comparison of two snapshots of the user's chart "${initialContext.chartName}".\n\n【Prior Analysis】\n${initialContext.analysisResult}\n\n【Comparison Data Summary】\n${comparisonSummary}\n\nAnswer the user's questions based on this analysis. Provide deeper structural tension insights and concrete action recommendations.`;
    systemPrompt = systemPrompt + escalationBlock;
  }

  if (isStructurize) {
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [2000, 5000, 10000];
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const message = await anthropic.messages.create({
          model: AI_MODEL.LIGHT,
          max_tokens: AI_MAX_TOKENS.structurize,
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
        logAiUsage(user.id, wsId, "coach/structurize", message.usage?.input_tokens, message.usage?.output_tokens);
        return NextResponse.json(result);
      } catch (parseError) {
        if (parseError instanceof SyntaxError) {
          logger.error("JSON parse error:", parseError);
          return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
        }
        const err = parseError as { status?: number; message?: string };
        const status = err?.status || 500;
        if (status === 529 && attempt < MAX_RETRIES - 1) {
          logger.info(`AI structurize: retrying (attempt ${attempt + 2}/${MAX_RETRIES})...`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]));
          continue;
        }
        logger.error("AI structurize error:", err?.message || err);
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

  if (isComparisonAnalyze) {
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [2000, 5000, 10000];
    const userContent = formatComparisonDataForAI(comparisonData, isEn);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const message = await anthropic.messages.create({
          model: AI_MODEL.PRIMARY,
          max_tokens: AI_MAX_TOKENS.comparison_analyze,
          system: systemPrompt,
          messages: [{ role: "user", content: userContent }],
        });
        const content = message.content[0];
        if (content.type !== "text") {
          return NextResponse.json({ error: "Unexpected response type" }, { status: 500 });
        }
        logAiUsage(user.id, wsId, "coach/comparison_analyze", message.usage?.input_tokens, message.usage?.output_tokens);
        return NextResponse.json({ analysis: content.text });
      } catch (error) {
        const err = error as { status?: number; message?: string };
        const status = err?.status || 500;
        if (status === 529 && attempt < MAX_RETRIES - 1) {
          logger.info(
            `AI comparison_analyze: retrying (attempt ${attempt + 2}/${MAX_RETRIES})...`
          );
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]));
          continue;
        }
        logger.error("AI comparison_analyze error:", err?.message || err);
        const errorMessage =
          err?.message?.includes("credit")
            ? "API credits insufficient"
            : status === 529
              ? "AI service is temporarily busy. Please try again in a moment."
              : "AI comparison analysis failed";
        return NextResponse.json({ error: errorMessage }, { status });
      }
    }
    return NextResponse.json(
      { error: "AI comparison analysis failed after retries" },
      { status: 500 }
    );
  }

  if (isExtractVrta) {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Messages are required" }, { status: 400 });
    }
    const extractPrompt = isEn ? EXTRACT_VRTA_PROMPT_EN : EXTRACT_VRTA_PROMPT_JA;
    const conversationText = messages
      .map((m: { role: string; content: string }) => `${m.role === "user" ? "User" : "Coach"}: ${m.content}`)
      .join("\n\n");

    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [2000, 5000, 10000];
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const message = await anthropic.messages.create({
          model: AI_MODEL.LIGHT,
          max_tokens: AI_MAX_TOKENS.extract_vrta,
          system: extractPrompt,
          messages: [{ role: "user", content: conversationText.slice(0, 12000) }],
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
        logAiUsage(user.id, wsId, "coach/extract_vrta", message.usage?.input_tokens, message.usage?.output_tokens);
        return NextResponse.json(result);
      } catch (parseError) {
        if (parseError instanceof SyntaxError) {
          logger.error("extract_vrta JSON parse error:", parseError);
          return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
        }
        const err = parseError as { status?: number; message?: string };
        const status = err?.status || 500;
        if (status === 529 && attempt < MAX_RETRIES - 1) {
          logger.info(`AI extract_vrta: retrying (attempt ${attempt + 2}/${MAX_RETRIES})...`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]));
          continue;
        }
        logger.error("AI extract_vrta error:", err?.message || err);
        const errorMessage = err?.message?.includes("credit")
          ? "API credits insufficient"
          : status === 529
            ? "AI service is temporarily busy. Please try again in a moment."
            : "VRTA extraction failed";
        return NextResponse.json({ error: errorMessage }, { status });
      }
    }
    return NextResponse.json({ error: "VRTA extraction failed after retries" }, { status: 500 });
  }

  const chartContext = formatChartContext(chartData, lang);
  const lastContent =
    messages?.length > 0
      ? messages[messages.length - 1].content
      : isChat
        ? (lang === "en"
          ? "I'd like to ask about structural tension theory or my chart."
          : "構造的テンション理論やチャートについて質問したいです。")
        : (lang === "en"
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
        model: AI_MODEL.PRIMARY,
        max_tokens: isChat ? AI_MAX_TOKENS.chat : AI_MAX_TOKENS.analyze,
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

      logAiUsage(user.id, wsId, `coach/${mode}`, message.usage?.input_tokens, message.usage?.output_tokens);
      return NextResponse.json({ response: content.text });
    } catch (error) {
      const err = error as { status?: number; message?: string };
      const status = err?.status || 500;

      // Retry on 529 (overloaded) or 529-like errors
      if (status === 529 && attempt < MAX_RETRIES - 1) {
        logger.info(`AI coach: retrying (attempt ${attempt + 2}/${MAX_RETRIES}) after ${RETRY_DELAYS[attempt]}ms...`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]));
        continue;
      }

      logger.error("AI coach error:", err?.message || err);
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

interface SnapshotSummaryData {
  visions?: { content?: string; title?: string }[];
  realities?: { content?: string; title?: string }[];
  tensions?: { title?: string; content?: string }[];
  actions?: unknown[];
}

interface ComparisonSummaryData {
  before?: { createdAt?: string };
  after?: { createdAt?: string };
  summary?: { addedCount?: number; modifiedCount?: number; removedCount?: number };
  diff?: {
    added?: { content?: string }[];
    modified?: { content?: string }[];
    removed?: { content?: string }[];
  };
}

function formatSnapshotSummary(snapshotData: SnapshotSummaryData | null | undefined, language: string): string {
  if (!snapshotData) return language === "ja" ? "(データなし)" : "(no data)";
  const isEn = language === "en";
  let s = "";
  const v = snapshotData.visions?.length ?? 0;
  const r = snapshotData.realities?.length ?? 0;
  const t = snapshotData.tensions?.length ?? 0;
  const a = snapshotData.actions?.length ?? 0;
  s += isEn ? `Visions: ${v}, Realities: ${r}, Tensions: ${t}, Actions: ${a}\n` : `ビジョン: ${v}, リアリティ: ${r}, テンション: ${t}, アクション: ${a}\n`;
  if (snapshotData.visions?.length) {
    s += isEn ? "Visions: " : "ビジョン: ";
    s += snapshotData.visions.map((x) => (x.content || x.title || "").slice(0, 80)).join("; ") + "\n";
  }
  if (snapshotData.realities?.length) {
    s += isEn ? "Realities: " : "リアリティ: ";
    s += snapshotData.realities.map((x) => (x.content || x.title || "").slice(0, 80)).join("; ") + "\n";
  }
  if (snapshotData.tensions?.length) {
    s += isEn ? "Tensions: " : "テンション: ";
    s += snapshotData.tensions.map((x) => (x.title || x.content || "").slice(0, 80)).join("; ") + "\n";
  }
  return s || (isEn ? "(empty)" : "(空)");
}

function formatComparisonSummary(comparisonData: ComparisonSummaryData | null | undefined, language: string): string {
  if (!comparisonData) return language === "ja" ? "(データなし)" : "(no data)";
  const isEn = language === "en";
  const s = comparisonData.summary;
  let out = isEn
    ? `Period: ${comparisonData.before?.createdAt ?? ""} → ${comparisonData.after?.createdAt ?? ""}\n`
    : `期間: ${comparisonData.before?.createdAt ?? ""} → ${comparisonData.after?.createdAt ?? ""}\n`;
  out += isEn
    ? `Summary: +${s?.addedCount ?? 0} added, ${s?.modifiedCount ?? 0} modified, -${s?.removedCount ?? 0} removed\n`
    : `サマリー: +${s?.addedCount ?? 0} 追加, ${s?.modifiedCount ?? 0} 変更, -${s?.removedCount ?? 0} 削除\n`;
  const diff = comparisonData.diff;
  if (diff?.added?.length) {
    out += (isEn ? "Added: " : "追加: ") + diff.added.map((x) => (x.content || "").slice(0, 60)).join("; ") + "\n";
  }
  if (diff?.modified?.length) {
    out += (isEn ? "Modified: " : "変更: ") + diff.modified.map((x) => (x.content || "").slice(0, 60)).join("; ") + "\n";
  }
  if (diff?.removed?.length) {
    out += (isEn ? "Removed: " : "削除: ") + diff.removed.map((x) => (x.content || "").slice(0, 60)).join("; ") + "\n";
  }
  return out || (isEn ? "(empty)" : "(空)");
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

const CHAT_SYSTEM_PROMPT_JA = `あなたはZENSHIN CHARTの壁打ちコーチです。
ロバート・フリッツの「緊張構造（Structural Tension）」理論に基づき、
ユーザーの思考を対話的に深める壁打ち相手として振る舞います。

【行動原則】
- 答えを出すのではなく、問いを投げる
- 1回の応答は短く（3〜5文程度）。長い説明はしない
- 必ず1つの問いかけで終わる
- ユーザーの言葉をそのまま使って確認する（パラフレーズ）
- 温かく、対等な立場で対話する

【対話の自然な流れ（厳密に順番通りでなくてよい）】
1. まずユーザーの話を受け止め、何について考えたいのか確認する
2. Vision（理想の状態）を引き出す — 「どうなったら最高ですか？」
3. Reality（現在の状態）を引き出す — 「今はどんな状況ですか？」
4. VisionとRealityのギャップ（Tension）を一緒に言語化する
5. 具体的なAction（次の一歩）を考える — 「最初の一手は何ができそうですか？」

ただし、この順番に固執しないこと。ユーザーの話の流れに合わせて柔軟に進める。
ユーザーがActionから話し始めたらそこから広げてもよい。

【禁止事項】
- 一度に複数の質問をしない（1回につき問いは1つだけ）
- 長文で説明しない（箇条書きの羅列もしない）
- ユーザーが聞いていないのにフレームワークの説明をしない
- 「まず〇〇を考えましょう。次に△△を…」と全体計画を最初に提示しない
- 「V/R/T/A」「Vision/Reality/Tension/Action」などの専門用語を会話中に使わない
  （ユーザーが自分から使った場合のみ使ってよい）

【初回の応答】
ユーザーの最初のメッセージに対しては、内容を短く受け止めてから、
最も自然な1つの問いを投げる。自己紹介や前置きは不要。

【用語統一ルール（日本語で応答する場合は必須）】
以下の用語は必ずこの日本語訳を使用すること。括弧内の訳語は使用禁止。
- oscillating structure → 葛藤構造（×振動パターン、×発振構造）
- advancing structure → 前進構造（×前進パターン）
- structural tension → 緊張構造（×構造的テンション）
- structural conflict → 構造的葛藤
- current reality → 現状（×現在の現実）
- tension-resolution system → 緊張解消システム
- dominant structure → 支配的構造
- hierarchy of importance → 重要性の階層
- primary choice → 第一の選択
- path of least resistance → 最小抵抗経路
- conflict pattern → 葛藤パターン`;

const CHAT_SYSTEM_PROMPT_EN = `You are a sparring coach for ZENSHIN CHART.
Based on Robert Fritz's "Structural Tension" theory,
you act as an interactive thinking partner who deepens the user's thinking through dialogue.

【Behavioral Principles】
- Ask questions instead of giving answers
- Keep each response short (about 3-5 sentences). No long explanations
- Always end with exactly one question
- Confirm using the user's own words (paraphrase)
- Be warm and engage as an equal partner

【Natural Flow of Dialogue (not strictly sequential)】
1. First, acknowledge the user's words and confirm what they want to think about
2. Draw out their Vision (ideal state) — "What would it look like at its best?"
3. Draw out their Reality (current state) — "What's the situation right now?"
4. Together, articulate the gap (Tension) between Vision and Reality
5. Explore a concrete Action (next step) — "What could be your first move?"

Do not rigidly follow this order. Adapt flexibly to the user's flow.
If the user starts with an Action, expand from there.

【Prohibited】
- Do not ask multiple questions at once (only one question per response)
- Do not write long explanations (no bullet-point lists either)
- Do not explain frameworks unless the user asks
- Do not present an overall plan upfront like "First let's think about X. Then Y..."
- Do not use jargon like "V/R/T/A" or "Vision/Reality/Tension/Action" in conversation
  (only use them if the user brings them up first)

【First Response】
For the user's first message, briefly acknowledge the content,
then ask the most natural single question. No self-introduction or preamble needed.

【Terminology Rules (required when responding in Japanese)】
Always use these exact Japanese translations. Terms in parentheses are forbidden.
- oscillating structure → 葛藤構造 (NOT 振動パターン, 発振構造)
- advancing structure → 前進構造 (NOT 前進パターン)
- structural tension → 緊張構造 (NOT 構造的テンション)
- structural conflict → 構造的葛藤
- current reality → 現状 (NOT 現在の現実)
- tension-resolution system → 緊張解消システム
- dominant structure → 支配的構造
- hierarchy of importance → 重要性の階層
- primary choice → 第一の選択
- path of least resistance → 最小抵抗経路
- conflict pattern → 葛藤パターン`;

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

function formatDateForPrompt(isoDate: string): string {
  if (!isoDate) return "";
  try {
    const d = new Date(isoDate);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return isoDate;
  }
}

function buildComparisonAnalyzeSystemPrompt(comparisonData: ComparisonSummaryData | null | undefined, isEn: boolean): string {
  const beforeDate = formatDateForPrompt(comparisonData?.before?.createdAt ?? "");
  const afterDate = formatDateForPrompt(comparisonData?.after?.createdAt ?? "");
  const template = isEn ? COMPARISON_ANALYZE_PROMPT_EN : COMPARISON_ANALYZE_PROMPT_JA;
  return template.replace(/\{before\.createdAt\}/g, beforeDate).replace(/\{after\.createdAt\}/g, afterDate);
}

interface ComparisonDataForAI extends ComparisonSummaryData {
  before?: ComparisonSummaryData["before"] & { data?: Record<string, unknown> };
  after?: ComparisonSummaryData["after"] & { data?: Record<string, unknown> };
  diff?: ComparisonSummaryData["diff"] & {
    added?: { type?: string; content?: string }[];
    modified?: { type?: string; content?: string; oldContent?: string }[];
    removed?: { type?: string; content?: string }[];
  };
}

function formatComparisonDataForAI(comparisonData: ComparisonDataForAI | null | undefined, isEn: boolean): string {
  const { before, after, diff, summary } = comparisonData || {};
  const lines: string[] = [];

  if (isEn) {
    lines.push("## Comparison Data");
    lines.push(`\n### Period: ${before?.createdAt ?? ""} → ${after?.createdAt ?? ""}`);
    lines.push(`\n### Summary: +${summary?.addedCount ?? 0} added, ${summary?.modifiedCount ?? 0} modified, -${summary?.removedCount ?? 0} removed`);
    lines.push("\n### Before Snapshot Data (VRTA):");
    lines.push(JSON.stringify(before?.data ?? {}, null, 2));
    lines.push("\n### After Snapshot Data (VRTA):");
    lines.push(JSON.stringify(after?.data ?? {}, null, 2));
    lines.push("\n### Diff Details:");
    if (diff?.added?.length) {
      lines.push("\n**Added:**");
      diff.added.forEach((x: { type?: string; content?: string }) =>
        lines.push(`- [${x.type}] ${x.content ?? ""}`)
      );
    }
    if (diff?.modified?.length) {
      lines.push("\n**Modified:**");
      diff.modified.forEach((x: { type?: string; content?: string; oldContent?: string }) =>
        lines.push(`- [${x.type}] ${x.oldContent ?? ""} → ${x.content ?? ""}`)
      );
    }
    if (diff?.removed?.length) {
      lines.push("\n**Removed:**");
      diff.removed.forEach((x: { type?: string; content?: string }) =>
        lines.push(`- [${x.type}] ${x.content ?? ""}`)
      );
    }
  } else {
    lines.push("## 比較データ");
    lines.push(`\n### 期間: ${before?.createdAt ?? ""} → ${after?.createdAt ?? ""}`);
    lines.push(`\n### サマリー: +${summary?.addedCount ?? 0} 追加, ${summary?.modifiedCount ?? 0} 変更, -${summary?.removedCount ?? 0} 削除`);
    lines.push("\n### 変更前スナップショットデータ (VRTA):");
    lines.push(JSON.stringify(before?.data ?? {}, null, 2));
    lines.push("\n### 変更後スナップショットデータ (VRTA):");
    lines.push(JSON.stringify(after?.data ?? {}, null, 2));
    lines.push("\n### 差分詳細:");
    if (diff?.added?.length) {
      lines.push("\n**追加:**");
      diff.added.forEach((x: { type?: string; content?: string }) =>
        lines.push(`- [${x.type}] ${x.content ?? ""}`)
      );
    }
    if (diff?.modified?.length) {
      lines.push("\n**変更:**");
      diff.modified.forEach((x: { type?: string; content?: string; oldContent?: string }) =>
        lines.push(`- [${x.type}] ${x.oldContent ?? ""} → ${x.content ?? ""}`)
      );
    }
    if (diff?.removed?.length) {
      lines.push("\n**削除:**");
      diff.removed.forEach((x: { type?: string; content?: string }) =>
        lines.push(`- [${x.type}] ${x.content ?? ""}`)
      );
    }
  }

  return lines.join("\n");
}

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

const COMPARISON_ANALYZE_PROMPT_JA = `あなたは ZENSHIN CHART の AI Coach です。
Robert Fritz の構造的テンション理論に基づいて、
2つの時点のスナップショットの変化を分析してください。

## 分析のフレームワーク

1. **変化のサマリー**
期間（{before.createdAt} → {after.createdAt}）の変化を簡潔にまとめてください。

2. **構造的テンションの観点からの分析**
- Vision（ビジョン）の変化: ビジョンが追加・修正・削除された場合、構造全体にどんな影響があるか
- Reality（現実）の変化: 現実認識がどう変わったか、ビジョンとのギャップ（構造的テンション）は縮まったか広がったか
- Tension（テンション）の変化: テンションの追加・解消は適切な進捗を示しているか
- Action（アクション）の変化: アクションの追加・完了・修正はテンションの解消に向かっているか

3. **パターン認識**
- Advancing structure（前進する構造）の兆候はあるか
- Oscillating structure（振動する構造）の兆候はあるか
- 停滞の兆候はあるか

4. **推奨アクション**
この変化パターンを踏まえて、次に取るべきアクションを1-3個提案してください。

## 重要なルール
- Fritz の理論では構造は「Advancing」と「Oscillating」の2種類のみ
- 分析は必ず Vision → Reality → Tension → Action の順で行う
- 数値の変化だけでなく、内容の質的変化にも注目する

Markdown形式で回答してください。`;

const COMPARISON_ANALYZE_PROMPT_EN = `You are ZENSHIN CHART's AI Coach.
Analyze the changes between two snapshots based on
Robert Fritz's structural tension theory.

## Analysis Framework

1. **Change Summary**
Summarize the changes during the period ({before.createdAt} → {after.createdAt}).

2. **Structural Tension Analysis**
- Vision changes: How do vision additions/modifications/removals affect the overall structure?
- Reality changes: How has reality perception shifted? Is the structural tension (gap between vision and reality) narrowing or widening?
- Tension changes: Do tension additions/resolutions indicate healthy progress?
- Action changes: Are action additions/completions/modifications moving toward tension resolution?

3. **Pattern Recognition**
- Signs of advancing structure?
- Signs of oscillating structure?
- Signs of stagnation?

4. **Recommended Actions**
Based on these change patterns, suggest 1-3 next actions.

## Important Rules
- Fritz's theory identifies exactly two structures: advancing and oscillating
- Analysis must follow Vision → Reality → Tension → Action order
- Focus on qualitative content changes, not just numerical changes

Respond in Markdown format.`;

const EXTRACT_VRTA_PROMPT_JA = `以下の対話内容から、ZENSHIN CHARTの構造に沿って情報を抽出してください。

必ず以下のJSON形式のみで応答してください。JSON以外のテキストは含めないでください。

{
  "visions": [{"title": "...", "description": "..."}],
  "realities": [{"title": "...", "description": "..."}],
  "tensions": [{"title": "...", "description": "..."}],
  "actions": [{"title": "...", "description": "...", "due_date": null}],
  "structural_diagnosis": {
    "type": "advancing | oscillating | unclear",
    "conflict_pattern": "該当する葛藤パターン名（oscillatingの場合、なければnull）",
    "hierarchy_selected": true,
    "reasoning": "判定の根拠（1-2文）"
  }
}

ルール:
- 対話に含まれない要素は空配列にする
- ユーザーの言葉をできるだけそのまま使う
- 推測で項目を追加しない
- titleは簡潔に（20文字以内）、descriptionに詳細を入れる
- 日本語で応答する

構造診断ルール:
- advancing（前進構造）: ビジョンが明確で、緊張解消システムが1つ。揺り戻しの兆候なし
- oscillating（葛藤構造）: 緊張解消システムが2つ並立。成功後の後退、繰り返しパターン
- unclear: 情報不十分で判定不能
- hierarchy_selected: 重要性の階層（目標間の優先順位）が明確に選択されているか

用語統一ルール（日本語出力時は必須）:
- oscillating structure → 葛藤構造（×振動パターン）
- advancing structure → 前進構造（×前進パターン）
- structural tension → 緊張構造（×構造的テンション）
- current reality → 現状（×現在の現実）`;

const EXTRACT_VRTA_PROMPT_EN = `Extract information from the following dialogue and structure it according to ZENSHIN CHART format.

Respond ONLY in the following JSON format. Do not include any text outside of JSON.

{
  "visions": [{"title": "...", "description": "..."}],
  "realities": [{"title": "...", "description": "..."}],
  "tensions": [{"title": "...", "description": "..."}],
  "actions": [{"title": "...", "description": "...", "due_date": null}],
  "structural_diagnosis": {
    "type": "advancing | oscillating | unclear",
    "conflict_pattern": "name of conflict pattern if oscillating, null otherwise",
    "hierarchy_selected": true,
    "reasoning": "1-2 sentence reasoning for the diagnosis"
  }
}

Rules:
- Use empty arrays for elements not present in the dialogue
- Use the user's own words as much as possible
- Do not add items based on speculation
- Keep titles concise (under 20 characters), put details in description
- Respond in English

Structural diagnosis rules:
- advancing: Clear vision, single tension-resolution system, no oscillation signs
- oscillating: Two competing tension-resolution systems, regression after progress
- unclear: Insufficient information to determine
- hierarchy_selected: Whether a clear hierarchy of importance (priority among goals) has been established

Terminology rules (when outputting Japanese):
- oscillating structure → 葛藤構造 (NOT 振動パターン)
- advancing structure → 前進構造 (NOT 前進パターン)
- structural tension → 緊張構造 (NOT 構造的テンション)
- current reality → 現状 (NOT 現在の現実)`;
