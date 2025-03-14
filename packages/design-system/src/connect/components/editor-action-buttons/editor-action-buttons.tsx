import { Icon } from "#powerhouse";

export type EditorActionButtonsProps = {
  readonly onSwitchboardLinkClick?: (() => void) | undefined;
  readonly onExport: () => void;
  readonly onClose: () => void;
  readonly onShowRevisionHistory: () => void;
};
export function EditorActionButtons(props: EditorActionButtonsProps) {
  const { onSwitchboardLinkClick, onExport, onClose, onShowRevisionHistory } =
    props;

  return (
    <div className="flex gap-x-2">
      {onSwitchboardLinkClick ? (
        <button
          className="flex h-8 items-center gap-x-2 rounded border border-gray-200 px-3 text-sm font-semibold text-gray-900 active:opacity-50"
          onClick={onSwitchboardLinkClick}
        >
          <Icon name="Drive" size={16} />
        </button>
      ) : null}
      <button
        className="flex h-8 items-center gap-x-2 rounded border border-gray-200 px-3 text-sm font-semibold text-gray-900 active:opacity-50"
        onClick={onExport}
      >
        Export <Icon name="Save" size={16} />
      </button>
      <button
        className="flex h-8 items-center gap-x-2 whitespace-nowrap rounded border border-gray-200 px-3 text-sm font-semibold text-gray-900 active:opacity-50"
        onClick={onShowRevisionHistory}
      >
        Revision history <Icon name="History" size={16} />
      </button>
      <button
        className="grid size-8 place-items-center rounded border border-gray-200 active:opacity-50"
        onClick={onClose}
      >
        <Icon name="Xmark" />
      </button>
    </div>
  );
}
