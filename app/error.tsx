"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/error]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F3F0E3] p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div>
          <img src="/zenshin-icon.svg" alt="ZENSHIN CHART" className="w-10 h-10 mx-auto mb-4 opacity-40" />
          <h1 className="text-lg font-semibold text-[#154665]">
            Something went wrong
          </h1>
          <p className="text-sm text-[#154665]/50 mt-2">
            An unexpected error occurred. Please try again.
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="px-4 py-2 text-sm font-medium rounded-md bg-[#154665] text-white hover:bg-[#154665]/90 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-4 py-2 text-sm font-medium rounded-md border border-[#154665]/20 text-[#154665] hover:bg-[#154665]/5 transition-colors"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
