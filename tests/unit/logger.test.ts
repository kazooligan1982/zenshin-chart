/**
 * PII-Safe Logger のテスト。
 * 目的: 実ユーザー（Fritz/麦ちゃん/RFC/W社）のチャート内容が Vercel Logs / Sentry に流れないことを担保する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractSafeError, hashId, logger } from "@/lib/logger";

type CapturedLine = { level: "info" | "warn" | "error"; payload: Record<string, unknown> };

function parseConsole(mock: { mock: { calls: unknown[][] } }): Record<string, unknown>[] {
  return mock.mock.calls.map((call) => JSON.parse(call[0] as string) as Record<string, unknown>);
}

describe("lib/logger", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 基本形
  // -------------------------------------------------------------------------
  describe("basic levels", () => {
    it("info/warn/error が適切な console メソッドに流れる", () => {
      logger.info("hello");
      logger.warn("attention");
      logger.error("boom");

      const infos = parseConsole(logSpy);
      const warns = parseConsole(warnSpy);
      const errors = parseConsole(errorSpy);

      expect(infos).toHaveLength(1);
      expect(warns).toHaveLength(1);
      expect(errors).toHaveLength(1);
      expect(infos[0]).toMatchObject({ level: "info", msg: "hello" });
      expect(warns[0]).toMatchObject({ level: "warn", msg: "attention" });
      expect(errors[0]).toMatchObject({ level: "error", msg: "boom" });
    });

    it("出力は常に 1 行の JSON 文字列（Vercel Logs で grep しやすい）", () => {
      logger.info("single-line", { a: 1 });
      const raw = logSpy.mock.calls[0][0] as string;
      expect(typeof raw).toBe("string");
      expect(raw.includes("\n")).toBe(false);
      expect(() => JSON.parse(raw)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 個人情報 / 本文のマスキング（最重要）
  // -------------------------------------------------------------------------
  describe("PII redaction", () => {
    it("ctx.email / ctx.name を redact する", () => {
      logger.info("invite", {
        email: "mugichan@example.com",
        name: "麦ちゃん",
        workspaceId: "ws-abc-123",
      });
      const [out] = parseConsole(logSpy);
      expect(out.email).toBe("[REDACTED:20chars]");
      expect(out.name).toBe("[REDACTED:4chars]");
      expect(out.workspaceId).toBe("ws-abc-123");
    });

    it("Vision/Reality/Tension/Action 本文キーを redact する", () => {
      logger.info("chart snapshot", {
        vision: "世界平和を実現する",
        reality: "会社が倒産しそう",
        tension: "葛藤している",
        action: "毎日3km走る",
        visions: ["a", "b", "c"],
        realities: ["x"],
      });
      const [out] = parseConsole(logSpy);
      expect(out.vision).toBe("[REDACTED:9chars]");
      expect(out.reality).toBe("[REDACTED:8chars]");
      expect(out.tension).toBe("[REDACTED:6chars]");
      expect(out.action).toBe("[REDACTED:7chars]");
      expect(out.visions).toBe("[REDACTED:3items]");
      expect(out.realities).toBe("[REDACTED:1items]");
    });

    it("title / content / body / description を redact する", () => {
      logger.info("comment", {
        title: "Fritzの秘密プロジェクト",
        content: "顧客との契約詳細...",
        body: "会議メモ",
        description: "ここは社外秘です",
      });
      const [out] = parseConsole(logSpy);
      expect(out.title).toMatch(/^\[REDACTED:/);
      expect(out.content).toMatch(/^\[REDACTED:/);
      expect(out.body).toMatch(/^\[REDACTED:/);
      expect(out.description).toMatch(/^\[REDACTED:/);
    });

    it("認証情報 (token / cookie / password 等) を redact する", () => {
      logger.info("auth", {
        password: "super-secret",
        token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        cookie: "session=abc",
        access_token: "ya29.a0...",
        apikey: "sk-ant-...",
      });
      const [out] = parseConsole(logSpy);
      expect(out.password).toMatch(/^\[REDACTED:/);
      expect(out.token).toMatch(/^\[REDACTED:/);
      expect(out.cookie).toMatch(/^\[REDACTED:/);
      expect(out.access_token).toMatch(/^\[REDACTED:/);
      expect(out.apikey).toMatch(/^\[REDACTED:/);
    });

    it("ネストされた構造でも redact が効く", () => {
      logger.info("nested", {
        workspace: {
          id: "ws-123",
          name: "W Ventures",
          owner: { email: "ceo@example.com", id: "user-abc" },
        },
      });
      const [out] = parseConsole(logSpy);
      const ws = out.workspace as Record<string, unknown>;
      expect(ws.id).toBe("ws-123");
      expect(ws.name).toMatch(/^\[REDACTED:/);
      const owner = ws.owner as Record<string, unknown>;
      expect(owner.email).toMatch(/^\[REDACTED:/);
      expect(owner.id).toBe("user-abc");
    });
  });

  // -------------------------------------------------------------------------
  // Supabase error の details / hint redact（Kaz 方針）
  // -------------------------------------------------------------------------
  describe("Supabase error sanitization (details/hint redaction)", () => {
    it("error 引数経由: details / hint は捨て、code / message / status のみ残す", () => {
      const supabaseError = {
        code: "23505",
        message: "duplicate key value violates unique constraint",
        details: "Failing row contains (uuid, 'ユーザーの秘密のVision本文', 0)",
        hint: "Check your input",
      };
      logger.error("vision insert failed", supabaseError);
      const [out] = parseConsole(errorSpy);
      const errField = out.error as Record<string, unknown>;
      expect(errField.code).toBe("23505");
      expect(errField.message).toBe("duplicate key value violates unique constraint");
      expect(errField).not.toHaveProperty("details");
      expect(errField).not.toHaveProperty("hint");
      // 文字列化しても本文が漏れないことを確認
      expect(JSON.stringify(out)).not.toContain("ユーザーの秘密");
    });

    it("ctx 経由で error を渡してもネスト内の details / hint が redact される", () => {
      const supabaseError = {
        code: "42501",
        message: "new row violates row-level security policy",
        details: "Failing row contains (uuid, 'Tension本文', ...)",
        hint: "Check RLS policy on table realities",
      };
      logger.warn("sync failed", { supabaseError });
      const [out] = parseConsole(warnSpy);
      const ctx = out.supabaseError as Record<string, unknown>;
      expect(ctx.code).toBe("42501");
      expect(ctx.message).toBe("new row violates row-level security policy");
      expect(ctx.details).toMatch(/^\[REDACTED:/);
      expect(ctx.hint).toMatch(/^\[REDACTED:/);
      expect(JSON.stringify(out)).not.toContain("Tension本文");
    });

    it("Error インスタンスは name / message のみ残す（stack などは出さない）", () => {
      const err = new TypeError("Cannot read properties of undefined (reading 'id')");
      logger.error("null deref", err);
      const [out] = parseConsole(errorSpy);
      const errField = out.error as Record<string, unknown>;
      expect(errField.name).toBe("TypeError");
      expect(errField.message).toMatch(/Cannot read properties/);
      expect(errField).not.toHaveProperty("stack");
      expect(errField).not.toHaveProperty("cause");
    });

    it("extractSafeError は単体でも安全な投影をする", () => {
      const err = {
        code: "FOO",
        message: "m",
        status: 500,
        name: "PostgrestError",
        details: "secret",
        hint: "secret-hint",
        input: { password: "p" },
      };
      const safe = extractSafeError(err);
      expect(safe).toEqual({
        code: "FOO",
        message: "m",
        status: 500,
        name: "PostgrestError",
      });
    });
  });

  // -------------------------------------------------------------------------
  // hashId
  // -------------------------------------------------------------------------
  describe("hashId", () => {
    it("同じ入力は同じ出力を返す（同値判定可能）", () => {
      const id = "94e2c1f0-1111-2222-3333-444455556666";
      expect(hashId(id)).toBe(hashId(id));
    });

    it("異なる入力は高確率で異なる出力（復元不可）", () => {
      expect(hashId("user-aaa")).not.toBe(hashId("user-bbb"));
    });

    it("長さは 8、空/null/undefined は [no-id]", () => {
      expect(hashId("abc")).toHaveLength(8);
      expect(hashId("")).toBe("[no-id]");
      expect(hashId(null)).toBe("[no-id]");
      expect(hashId(undefined)).toBe("[no-id]");
    });

    it("元の値そのものは絶対に出力に含まれない", () => {
      const id = "kaz-secret-user-id-12345";
      const hashed = hashId(id);
      expect(hashed).not.toContain("kaz");
      expect(hashed).not.toContain("secret");
    });
  });

  // -------------------------------------------------------------------------
  // API 使い勝手
  // -------------------------------------------------------------------------
  describe("API ergonomics", () => {
    it("ctx なしで呼べる", () => {
      expect(() => logger.info("no ctx")).not.toThrow();
      const [out] = parseConsole(logSpy);
      expect(out).toEqual({ level: "info", msg: "no ctx" });
    });

    it("error() は err / ctx の両方を受け取れる", () => {
      logger.error("failed to save", new Error("db down"), {
        chartId: hashId("chart-xyz"),
      });
      const [out] = parseConsole(errorSpy);
      expect(out.msg).toBe("failed to save");
      expect((out.error as Record<string, unknown>).message).toBe("db down");
      expect(typeof out.chartId).toBe("string");
      expect((out.chartId as string).length).toBe(8);
    });

    it("ctx で level/msg/error キーが衝突しても top-level を上書きしない", () => {
      logger.info("canonical", {
        level: "debug",
        msg: "ctx msg",
        error: "ctx error",
        safeKey: "keepme",
      });
      const [out] = parseConsole(logSpy);
      expect(out.level).toBe("info");
      expect(out.msg).toBe("canonical");
      expect(out.safeKey).toBe("keepme");
    });
  });

  // -------------------------------------------------------------------------
  // 深さ・循環対策
  // -------------------------------------------------------------------------
  describe("safety limits", () => {
    it("深すぎるネストは [TRUNCATED:depth] で打ち切る", () => {
      const deep: Record<string, unknown> = { a: {} };
      let cur = deep.a as Record<string, unknown>;
      for (let i = 0; i < 20; i++) {
        cur.a = {};
        cur = cur.a as Record<string, unknown>;
      }
      expect(() => logger.info("deep", deep)).not.toThrow();
      const raw = logSpy.mock.calls[0][0] as string;
      expect(raw).toContain("[TRUNCATED:depth]");
    });
  });
});
