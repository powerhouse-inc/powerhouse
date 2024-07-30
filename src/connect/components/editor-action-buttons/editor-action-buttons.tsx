import { Icon } from '@/powerhouse';

type Props = {
    onSwitchboardLinkClick: (() => void) | undefined;
    onExport: () => void;
    onClose: () => void;
    onShowRevisionHistory: () => void;
};
export function EditorActionButtons(props: Props) {
    const { onSwitchboardLinkClick, onExport, onClose, onShowRevisionHistory } =
        props;

    return (
        <div className="flex gap-x-2">
            {onSwitchboardLinkClick && (
                <button
                    className="flex h-8 items-center gap-x-2 rounded border border-gray-200 px-3 text-sm font-semibold text-gray-900 active:opacity-50"
                    onClick={onSwitchboardLinkClick}
                >
                    <Icon name="drive" size={16} />
                </button>
            )}
            <button
                className="flex h-8 items-center gap-x-2 rounded border border-gray-200 px-3 text-sm font-semibold text-gray-900 active:opacity-50"
                onClick={onExport}
            >
                Export <Icon name="save" size={16} />
            </button>
            <button
                className="flex h-8 items-center gap-x-2 whitespace-nowrap rounded border border-gray-200 px-3 text-sm font-semibold text-gray-900 active:opacity-50"
                onClick={onShowRevisionHistory}
            >
                Revision history <Icon name="history" size={16} />
            </button>
            <button
                className="grid size-8 place-items-center rounded border border-gray-200 active:opacity-50"
                onClick={onClose}
            >
                <Icon name="xmark" />
            </button>
        </div>
    );
}
