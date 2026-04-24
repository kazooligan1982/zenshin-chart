/**
 * PII-Safe structured logger for ZENSHIN CHART.
 *
 * 設計方針:
 * - すべての `console.*` はこの logger を経由させる（PIIマスキングが効かないため）。
 * - `ctx` に含まれる値は `FORBIDDEN_KEYS` に従って自動 redact。
 * - Supabase / Anthropic / 汎用 `Error` オブジェクトは
 *   `extractSafeError()` 経由で `{ code, message, name, status }` のみを残す。
 *   Supabase error の `details` / `hint` には「失敗行の実値」が入るため削除。
 * - ID 系は `hashId()` で SHA-256 先頭 8 文字に短縮（同値判定は可能、復元は不可）。
 * - Sentry は optional。`NEXT_PUBLIC_SENTRY_DSN` が設定されたときだけ `sendToSentry()` が呼ばれる。
 *   現時点では no-op スタブ（ClickUp #86exa38cq で将来導入予定）。
 *
 * 使い方:
 * ```ts
 * import { logger } from "@/lib/logger";
 *
 * logger.info("chart loaded", { chartId: logger.hashId(chart.id) });
 * logger.warn("missing feature flag", { flag: "foo" });
 * logger.error("failed to save vision", error, { chartId: logger.hashId(chartId) });
 * ```
 */

type LogLevel = "info" | "warn" | "error";
export type LogContext = Record<string, unknown>;

/**
 * `ctx` の中でこれらのキーを見つけたら、値を `[REDACTED:<長さ>chars]` 等に置き換える。
 *
 * - 個人情報: email / name / full_name / phone / address
 * - ユーザー入力本文: content / body / text / title / description / note(s)
 * - Chart要素の本文: vision(s) / reality(realities) / tension(s) / action(s)
 * - AI 系: prompt / response / messages / system_prompt / user_content / assistant_content
 * - Supabase error の失敗行: details / hint
 *   （code と message は残す → デバッグに必要）
 * - 認証情報: password / authorization / cookie / token / api_key / secret / session / access_token / refresh_token
 *
 * `name` は Error の識別にも使われるが、ctx に `{ user: { name } }` 等で混入するケースが多いため
 * 保守的に redact する（Error 自体は `extractSafeError()` 経由で別ルートを通る）。
 */
const FORBIDDEN_KEYS = new Set<string>([
  // 個人情報
  "email",
  "full_name",
  "phone",
  "address",
  // 表示名・ワークスペース名・チャート名（PII寄り）
  "name",
  // ユーザー入力本文
  "content",
  "body",
  "text",
  "title",
  "description",
  "note",
  "notes",
  // Chart 要素
  "vision",
  "reality",
  "tension",
  "action",
  "visions",
  "realities",
  "tensions",
  "actions",
  // AI 系
  "prompt",
  "response",
  "messages",
  "system_prompt",
  "user_content",
  "assistant_content",
  // Supabase error の失敗行フィールド
  "details",
  "hint",
  // 認証情報
  "password",
  "authorization",
  "cookie",
  "token",
  "api_key",
  "apikey",
  "secret",
  "access_token",
  "refresh_token",
  "session",
]);

const MAX_DEPTH = 5;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function redactedPlaceholder(value: unknown): string {
  if (typeof value === "string") return `[REDACTED:${value.length}chars]`;
  if (Array.isArray(value)) return `[REDACTED:${value.length}items]`;
  return "[REDACTED]";
}

/**
 * `ctx` を再帰的に sanitize する。
 * - FORBIDDEN_KEYS のキーは値ごと redact
 * - 深さ 5 で打ち切り（循環参照・巨大オブジェクト対策）
 * - Error インスタンスは `extractSafeError()` で平坦化
 * - Date/Map/Set などは型名のみ残す
 */
function sanitize(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[TRUNCATED:depth]";
  if (value == null) return value;
  if (typeof value !== "object") return value;
  if (value instanceof Error) return extractSafeError(value);
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  if (!isPlainObject(value)) {
    const ctor = (value as { constructor?: { name?: string } }).constructor?.name;
    return `[object ${ctor ?? "unknown"}]`;
  }
  const result: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      result[key] = redactedPlaceholder(v);
    } else {
      result[key] = sanitize(v, depth + 1);
    }
  }
  return result;
}

/**
 * Supabase / Anthropic / 汎用 Error から「安全な表現」だけを抽出する。
 *
 * 残す: `name` / `message` / `code` / `status`
 * 捨てる: `details` / `hint` / `cause` / `request` / `response` / `input` / その他
 *
 * Supabase の PostgrestError は `{ code, message, details, hint }` という構造で、
 * `details` に「Failing row contains (uuid, ws-uuid, 'ユーザー入力本文', ...)」が入る。
 * これを Vercel Logs に流さないのがこの関数の主目的。
 */
export function extractSafeError(err: unknown): Record<string, unknown> {
  if (err == null) return { value: null };
  if (typeof err === "string") return { message: err };
  if (typeof err !== "object") return { message: String(err) };
  const e = err as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  if (typeof e.name === "string") safe.name = e.name;
  if (typeof e.message === "string") safe.message = e.message;
  if (typeof e.code === "string" || typeof e.code === "number") safe.code = e.code;
  if (typeof e.status === "number") safe.status = e.status;
  return safe;
}

/**
 * ID を決定的ハッシュ（FNV-1a 32bit）の 8 文字 hex に短縮する。
 *
 * - 同値判定は可能（同じ ID は同じハッシュ）
 * - 元の値への復元は不可（ただしログ redact 目的であり、暗号用途ではない）
 * - `null` / `undefined` / 空文字は `[no-id]`
 *
 * 実装メモ: Node.js `crypto` を使わないのは、client component からも import されるため。
 * Web Crypto の `crypto.subtle.digest` は async で sync logger と相性が悪いので、
 * 同期で動く FNV-1a を使用。SHA-256 を 8 文字に切り詰めた場合とセキュリティ特性は実質同じ。
 */
export function hashId(id: string | null | undefined): string {
  if (!id) return "[no-id]";
  if (typeof id !== "string") return "[invalid-id]";
  // FNV-1a 32bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Sentry が設定されていれば呼び出す。
 *
 * 将来 `@sentry/nextjs` を導入する際は以下のように書き換える:
 *
 * ```ts
 * import * as Sentry from "@sentry/nextjs";
 * Sentry.captureMessage(payload.msg as string, {
 *   level: payload.level as "info" | "warning" | "error",
 *   extra: payload,
 * });
 * ```
 *
 * 現時点では no-op スタブ。`NEXT_PUBLIC_SENTRY_DSN` が未設定の場合はこの関数自体が呼ばれない。
 */
function sendToSentry(_payload: Record<string, unknown>): void {
  // TODO(#86exa38cq): @sentry/nextjs 導入時にここに実装を追加する
}

function hasSentryDsn(): boolean {
  try {
    return !!(typeof process !== "undefined" && process.env?.NEXT_PUBLIC_SENTRY_DSN);
  } catch {
    return false;
  }
}

function emit(level: LogLevel, payload: Record<string, unknown>): void {
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);

  if (level !== "info" && hasSentryDsn()) {
    sendToSentry(payload);
  }
}

function buildPayload(
  level: LogLevel,
  msg: string,
  err: unknown,
  ctx: LogContext | undefined
): Record<string, unknown> {
  const payload: Record<string, unknown> = { level, msg };
  if (err !== undefined) {
    payload.error = extractSafeError(err);
  }
  if (ctx) {
    const sanitized = sanitize(ctx);
    if (sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)) {
      for (const [k, v] of Object.entries(sanitized as Record<string, unknown>)) {
        if (k === "level" || k === "msg" || k === "error") continue;
        payload[k] = v;
      }
    }
  }
  return payload;
}

export const logger = {
  info(msg: string, ctx?: LogContext): void {
    emit("info", buildPayload("info", msg, undefined, ctx));
  },
  warn(msg: string, ctx?: LogContext): void {
    emit("warn", buildPayload("warn", msg, undefined, ctx));
  },
  error(msg: string, err?: unknown, ctx?: LogContext): void {
    emit("error", buildPayload("error", msg, err, ctx));
  },
  hashId,
  extractSafeError,
};

export type Logger = typeof logger;
