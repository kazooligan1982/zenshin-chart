import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

const LIMITS = {
  USER_DAILY: 100,
  WORKSPACE_DAILY: 500,
  USER_PER_MINUTE: 10,
};

// 失敗時の設計方針: fail-open + logger.error
// ベータ段階ではユーザー体験優先、Anthropic Console のハードリミットが最終防衛線。
// 詳細は CLAUDE.md の「レート制限の設計思想」セクション参照。

export async function checkRateLimit(
  userId: string,
  workspaceId: string | null,
  endpoint: string
): Promise<{ allowed: boolean; reason?: string }> {
  const supabase = createServiceRoleClient();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString();

  // Per-minute burst limit
  const { count: userMinute, error: userMinuteError } = await supabase
    .from("ai_usage_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", oneMinAgo);

  if (userMinuteError) {
    logger.error("[checkRateLimit] count query failed", userMinuteError, {
      scope: "user_minute",
      endpoint,
      userId: logger.hashId(userId),
      workspaceId: logger.hashId(workspaceId),
    });
    // fail-open: エラー時は制限をスキップして処理を継続
    // （本番安定後に fail-closed への切り替えを検討）
  }

  if ((userMinute ?? 0) >= LIMITS.USER_PER_MINUTE) {
    return {
      allowed: false,
      reason: `Rate limit: max ${LIMITS.USER_PER_MINUTE} requests per minute`,
    };
  }

  // User daily limit
  const { count: userDaily, error: userDailyError } = await supabase
    .from("ai_usage_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", oneDayAgo);

  if (userDailyError) {
    logger.error("[checkRateLimit] count query failed", userDailyError, {
      scope: "user_daily",
      endpoint,
      userId: logger.hashId(userId),
      workspaceId: logger.hashId(workspaceId),
    });
    // fail-open: 同上
  }

  if ((userDaily ?? 0) >= LIMITS.USER_DAILY) {
    return {
      allowed: false,
      reason: `Daily limit reached (${LIMITS.USER_DAILY} requests per day)`,
    };
  }

  // Workspace daily limit
  if (workspaceId) {
    const { count: wsDaily, error: wsDailyError } = await supabase
      .from("ai_usage_log")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("created_at", oneDayAgo);

    if (wsDailyError) {
      logger.error("[checkRateLimit] count query failed", wsDailyError, {
        scope: "workspace_daily",
        endpoint,
        userId: logger.hashId(userId),
        workspaceId: logger.hashId(workspaceId),
      });
      // fail-open: 同上
    }

    if ((wsDaily ?? 0) >= LIMITS.WORKSPACE_DAILY) {
      return {
        allowed: false,
        reason: `Workspace daily limit reached (${LIMITS.WORKSPACE_DAILY} requests per day)`,
      };
    }
  }

  return { allowed: true };
}

export async function logAiUsage(
  userId: string,
  workspaceId: string | null,
  endpoint: string,
  tokensInput?: number,
  tokensOutput?: number
) {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("ai_usage_log").insert({
      user_id: userId,
      workspace_id: workspaceId,
      endpoint,
      tokens_input: tokensInput ?? null,
      tokens_output: tokensOutput ?? null,
    });
    if (error) {
      logger.error("[logAiUsage] insert failed", error, {
        endpoint,
        userId: logger.hashId(userId),
        workspaceId: logger.hashId(workspaceId),
      });
    }
  } catch (err) {
    logger.error("[logAiUsage] unexpected error", err, {
      endpoint,
      userId: logger.hashId(userId),
      workspaceId: logger.hashId(workspaceId),
    });
  }
}
