"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function SupabaseDebug() {
  const [status, setStatus] = useState<{
    connected: boolean;
    error?: string;
    tables?: string[];
  }>({ connected: false });

  useEffect(() => {
    async function checkConnection() {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!url || !key) {
        setStatus({
          connected: false,
          error: "環境変数が設定されていません。.env.local ファイルを確認してください。",
        });
        return;
      }

      if (!supabase) {
        setStatus({
          connected: false,
          error: "Supabase client not initialized. Check environment variables.",
        });
        return;
      }

      try {
        // テーブル一覧を取得して接続確認
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { data: _charts, error } = await supabase
          .from("charts")
          .select("id, title")
          .limit(5);

        if (error) {
          let errorMessage = error.message;
          
          // エラーコードに基づいた詳細なメッセージ
          if (error.code === "PGRST116") {
            errorMessage = "テーブル 'charts' が見つかりません。supabase/schema.sql を実行してください。";
          } else if (error.code === "42501") {
            errorMessage = "権限エラーです。RLSポリシーを確認してください。";
          } else if (error.code === "PGRST301") {
            errorMessage = "APIキーが無効です。正しいキーを確認してください。";
          }

          setStatus({
            connected: false,
            error: `${errorMessage} (Code: ${error.code})`,
          });
        } else {
          setStatus({
            connected: true,
            tables: ["charts", "visions", "realities", "tensions", "actions"],
          });
        }
      } catch (err) {
        setStatus({
          connected: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    checkConnection();
  }, []);

  return (
    <div className="fixed bottom-4 right-4 bg-white p-4 rounded-lg shadow-lg border text-xs max-w-sm z-50">
      <h3 className="font-bold mb-2">Supabase接続状態</h3>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              status.connected ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span>{status.connected ? "接続済み" : "未接続"}</span>
        </div>
        {status.error && (
          <div className="text-red-600 mt-2 p-2 bg-red-50 rounded">
            {status.error}
          </div>
        )}
        {status.connected && (
          <div className="text-green-600 mt-2">
            ✓ データベース接続成功
          </div>
        )}
        <div className="mt-2 pt-2 border-t text-muted-foreground">
          <div>
            URL: {typeof window !== "undefined" && (window as unknown as Record<string, unknown> & { __NEXT_DATA__?: { env?: Record<string, string> } }).__NEXT_DATA__?.env?.NEXT_PUBLIC_SUPABASE_URL ? "✓" : "✗"}
          </div>
          <div>
            Key: {typeof window !== "undefined" && (window as unknown as Record<string, unknown> & { __NEXT_DATA__?: { env?: Record<string, string> } }).__NEXT_DATA__?.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "✓" : "✗"}
          </div>
          {!supabase && (
            <div className="mt-2 text-xs text-red-600">
              <p>環境変数が設定されていません。</p>
              <p className="mt-1">.env.local ファイルを作成してください。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

