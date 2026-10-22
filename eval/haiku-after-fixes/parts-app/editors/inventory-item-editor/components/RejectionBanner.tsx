/** Shows the reducer error for a change the document rejected. */
export function RejectionBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-4 rounded-md border border-red-600 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200"
    >
      <span>Change rejected: {message}</span>
      <button type="button" className="font-medium underline" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
