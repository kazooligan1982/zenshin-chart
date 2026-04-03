"use client";

import { useEffect, useState } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [incidentId, setIncidentId] = useState<string | null>(null);

  useEffect(() => {
    const id = String(Date.now());
    queueMicrotask(() => {
      setIncidentId(id);
    });
  }, []);

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ja">
      <body className="min-h-screen bg-background font-sans antialiased flex flex-col items-center justify-center p-6 text-foreground">
        <div className="max-w-md w-full space-y-4 text-center">
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
            予期しないエラーが発生しました
          </h1>
          <p className="text-sm text-muted-foreground">
            {incidentId !== null && (
              <>
                ID: <span className="font-mono">{incidentId}</span>
              </>
            )}
            {error.digest ? (
              <span className="block mt-2">Digest: {error.digest}</span>
            ) : null}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            再試行
          </button>
        </div>
      </body>
    </html>
  );
}
