"use client";

export default function InboxError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="rounded-full bg-red-100 p-4">
        <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.834-1.964-.834-2.732 0L4.072 16.5C3.302 18.333 4.264 20 5.804 20z" />
        </svg>
      </div>
      <div>
        <h2 className="text-lg font-semibold">Inbox gagal dimuat</h2>
        <p className="mt-1 text-sm text-muted-foreground">{error?.message ?? "Unknown error"}</p>
        {error?.digest && <p className="mt-0.5 text-xs text-muted-foreground font-mono">Digest: {error.digest}</p>}
      </div>
      <button
        onClick={reset}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Coba lagi
      </button>
    </div>
  );
}
