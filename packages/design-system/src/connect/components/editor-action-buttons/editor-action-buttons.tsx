import { Icon } from "#powerhouse";

export type EditorActionButtonsProps = {
  readonly onSwitchboardLinkClick?: (() => void) | undefined;
  readonly onExport?: (() => void) | undefined;
  readonly onClose: () => void;
  readonly onShowRevisionHistory?: (() => void) | undefined;
  readonly onShowTimeline?: (() => void) | undefined;
};

export function EditorActionButtons(props: EditorActionButtonsProps) {
  const {
    onSwitchboardLinkClick,
    onExport,
    onClose,
    onShowRevisionHistory,
    onShowTimeline,
  } = props;

  return (
    <div className="flex items-center gap-x-2">
      {onSwitchboardLinkClick && (
        <button
          className="grid size-8 place-items-center rounded-lg border border-gray-200 bg-white text-gray-900 disabled:cursor-not-allowed disabled:text-gray-500"
          onClick={onSwitchboardLinkClick}
          disabled={!onSwitchboardLinkClick}
        >
          <Icon name="Drive" size={16} />
        </button>
      )}
      {onShowRevisionHistory && (
        <button
          className="grid size-8 place-items-center rounded-lg border border-gray-200 bg-white text-gray-900 disabled:cursor-not-allowed disabled:text-gray-500"
          onClick={onShowRevisionHistory}
          disabled={!onShowRevisionHistory}
        >
          <Icon name="History" size={16} />
        </button>
      )}
      {onShowTimeline && (
        <button
          className="grid size-8 place-items-center rounded-lg border border-gray-200 bg-white text-gray-900 disabled:cursor-not-allowed disabled:text-gray-500"
          onClick={onShowTimeline}
          disabled={!onShowTimeline}
        >
          <Icon name="Timeline" size={16} />
        </button>
      )}
      <button
        className="grid size-8 place-items-center rounded-lg border border-gray-200 bg-white text-gray-900"
        onClick={onClose}
      >
        <Icon name="XmarkLight" size={16} />
      </button>
    </div>
  );
}
