"use client";

import { useEffect } from "react";
import { logger } from "@/lib/logger";
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="ja">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#F3F0E3", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 400, textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: "#154665", marginBottom: 8 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, color: "#154665", opacity: 0.5, marginBottom: 24 }}>
            An unexpected error occurred.
            {error.digest ? ` (${error.digest})` : ""}
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              onClick={() => reset()}
              style={{ padding: "8px 16px", fontSize: 14, fontWeight: 500, borderRadius: 6, border: "none", background: "#154665", color: "white", cursor: "pointer" }}
            >
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{ padding: "8px 16px", fontSize: 14, fontWeight: 500, borderRadius: 6, border: "1px solid #15466533", color: "#154665", textDecoration: "none", cursor: "pointer" }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
