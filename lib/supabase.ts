import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// デバッグ用: 環境変数の状態を確認
if (typeof window === "undefined") {
  // サーバーサイドでのみログ出力
  
  // 環境変数の形式チェック
  if (supabaseUrl && !supabaseUrl.startsWith("http")) {
    console.warn("[Supabase] ⚠️ URLが正しい形式ではありません。https://で始まる必要があります。");
  }
  if (supabaseAnonKey && !supabaseAnonKey.startsWith("eyJ")) {
    console.warn("[Supabase] ⚠️ APIキーが正しい形式ではありません。eyJで始まる必要があります。");
  }
}

// 環境変数が設定されている場合のみクライアントを作成
// ビルド時や開発時には環境変数がなくてもエラーを出さない
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : (null as unknown as ReturnType<typeof createClient>); // 型安全性のため、実際の使用時には環境変数チェックが必要

