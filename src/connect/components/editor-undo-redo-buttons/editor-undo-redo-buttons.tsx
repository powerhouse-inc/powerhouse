import { Icon } from '@/powerhouse';
import { twMerge } from 'tailwind-merge';

type Props = {
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    readonly undo: () => void;
    readonly redo: () => void;
};
export function EditorUndoRedoButtons(props: Props) {
    const { canUndo, canRedo, undo, redo } = props;
    const buttonStyles =
        'w-8 h-8 tab-shadow rounded-lg flex justify-center items-center';
    return (
        <div className="flex gap-x-2 text-gray-500">
            <button className={buttonStyles} disabled={!canUndo} onClick={undo}>
                <Icon
                    className={twMerge(
                        '-scale-x-100',
                        canUndo ? 'active:opacity-50' : 'text-gray-500',
                    )}
                    name="RedoArrow"
                />
            </button>
            <button className={buttonStyles} disabled={!canRedo} onClick={redo}>
                <Icon
                    className={twMerge(
                        canRedo ? 'active:opacity-50' : 'text-gray-500',
                    )}
                    name="RedoArrow"
                />
            </button>
        </div>
    );
}
