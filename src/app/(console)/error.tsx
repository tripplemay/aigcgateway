"use client";

export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <span className="material-symbols-outlined text-5xl text-ds-error">error</span>
      <h2 className="text-xl font-bold text-ds-on-surface">Something went wrong</h2>
      <p className="text-sm text-ds-on-surface-variant max-w-md text-center">
        {error.message || "An unexpected error occurred."}
      </p>
      <button
        onClick={reset}
        className="px-6 py-2.5 bg-ds-primary text-white rounded-xl font-bold text-sm hover:bg-ds-primary/90 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
