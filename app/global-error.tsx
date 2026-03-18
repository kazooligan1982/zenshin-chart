"use client";

/**
 * Global error boundary that catches unrecoverable rendering errors,
 * including the React 19 hooks bug (facebook/react#33580) where the
 * Next.js Router's conditional use(thenable) causes
 * "Rendered more hooks than during the previous render".
 *
 * When the hooks bug is caught, we auto-reload once to recover cleanly.
 * For other errors, we show a simple error UI with retry/home buttons.
 *
 * TODO: Remove the auto-reload once React merges the fix (#35717).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isHooksBug =
    error.message?.includes("Rendered more hooks") ||
    error.message?.includes("Rendered fewer hooks");

  // Auto-reload for the known React 19 hooks bug.
  // Use sessionStorage to prevent infinite reload loops.
  if (isHooksBug && typeof window !== "undefined") {
    const key = "__zenshin_hooks_bug_reload";
    const lastReload = sessionStorage.getItem(key);
    const now = Date.now();

    // Only auto-reload once per 5 seconds
    if (!lastReload || now - Number(lastReload) > 5000) {
      sessionStorage.setItem(key, String(now));
      window.location.reload();
      return null;
    }
  }

  return (
    <html>
      <body className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4 p-8">
          <h2 className="text-xl font-semibold text-gray-800">
            エラーが発生しました
          </h2>
          <p className="text-sm text-gray-500">
            {isHooksBug
              ? "一時的な問題が発生しました。ページをリロードしてください。"
              : "ページの読み込み中に問題が発生しました。"}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              リロード
            </button>
            <button
              onClick={() => (window.location.href = "/charts")}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
            >
              ホームに戻る
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
