export function ChatPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400">
      <div className="text-4xl mb-4">💬</div>
      <h2 className="text-lg font-semibold text-gray-600 mb-1">
        Chat coming soon
      </h2>
      <p className="text-sm text-gray-400 mb-6">
        AI-powered deal conversations will be available here.
      </p>
      <div className="w-full max-w-md">
        <div className="flex gap-2">
          <input
            type="text"
            disabled
            placeholder="Ask about a deal..."
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-400 cursor-not-allowed"
          />
          <button
            disabled
            className="px-4 py-2 bg-gray-200 text-gray-400 rounded-lg text-sm font-medium cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
