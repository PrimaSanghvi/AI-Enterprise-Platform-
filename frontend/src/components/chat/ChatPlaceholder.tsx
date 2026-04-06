export function ChatPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
      <div className="text-4xl mb-4">💬</div>
      <h2 className="text-lg font-semibold text-[var(--text-secondary)] mb-1">
        Chat coming soon
      </h2>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        AI-powered deal conversations will be available here.
      </p>
      <div className="w-full max-w-md">
        <div className="flex gap-2">
          <input
            type="text"
            disabled
            placeholder="Ask about a deal..."
            className="flex-1 px-4 py-2 border border-[var(--border-color)] rounded-lg bg-[var(--bg-card-alt)] text-sm text-[var(--text-muted)] cursor-not-allowed"
          />
          <button
            disabled
            className="px-4 py-2 bg-[var(--bg-card-alt)] text-[var(--text-muted)] rounded-lg text-sm font-medium cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
