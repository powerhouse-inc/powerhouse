import { Icon } from "#design-system";

export type EditorActionButtonsProps = {
  readonly onSwitchboardLinkClick?: (() => void) | undefined;
  readonly onDownloadDocument?: (() => void) | undefined;
  readonly onClose: () => void;
  readonly onShowRevisionHistory?: (() => void) | undefined;
  readonly onShowTimeline?: (() => void) | undefined;
};

export function EditorActionButtons(props: EditorActionButtonsProps) {
  const {
    onSwitchboardLinkClick,
    onDownloadDocument: _onDownloadDocument,
    onClose,
    onShowRevisionHistory,
    onShowTimeline,
  } = props;

  return (
    <div className="flex items-center gap-x-2">
      {onSwitchboardLinkClick && (
        <button
          className="grid size-8 place-items-center rounded-lg border border-gray-300 bg-gray-50 text-gray-900 disabled:cursor-not-allowed disabled:text-gray-500 dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100 dark:disabled:text-slate-400"
          onClick={onSwitchboardLinkClick}
          disabled={!onSwitchboardLinkClick}
        >
          <Icon name="Drive" size={16} />
        </button>
      )}
      {onShowRevisionHistory && (
        <button
          className="grid size-8 place-items-center rounded-lg border border-gray-300 bg-gray-50 text-gray-900 disabled:cursor-not-allowed disabled:text-gray-500 dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100 dark:disabled:text-slate-400"
          onClick={onShowRevisionHistory}
          disabled={!onShowRevisionHistory}
        >
          <Icon name="History" size={16} />
        </button>
      )}
      {onShowTimeline && (
        <button
          className="grid size-8 place-items-center rounded-lg border border-gray-300 bg-gray-50 text-gray-900 disabled:cursor-not-allowed disabled:text-gray-500 dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100 dark:disabled:text-slate-400"
          onClick={onShowTimeline}
          disabled={!onShowTimeline}
        >
          <Icon name="Timeline" size={16} />
        </button>
      )}
      <button
        className="grid size-8 place-items-center rounded-lg border border-gray-300 bg-gray-50 text-gray-900 dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100"
        onClick={onClose}
      >
        <Icon name="XmarkLight" size={16} />
      </button>
    </div>
  );
}
