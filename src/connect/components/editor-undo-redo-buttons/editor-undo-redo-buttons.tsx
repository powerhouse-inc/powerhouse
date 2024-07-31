import { Icon } from '@/powerhouse';
import { twMerge } from 'tailwind-merge';

type Props = {
    canUndo: boolean;
    canRedo: boolean;
    undo: () => void;
    redo: () => void;
};
export function EditorUndoRedoButtons(props: Props) {
    const { canUndo, canRedo, undo, redo } = props;
    const buttonStyles =
        'w-8 h-8 tab-shadow rounded-lg flex justify-center items-center';
    return (
        <div className="flex gap-x-2 text-gray-500">
            <button onClick={undo} disabled={!canUndo} className={buttonStyles}>
                <Icon
                    name="RedoArrow"
                    className={twMerge(
                        'scale-x-[-1]',
                        canUndo ? 'active:opacity-50' : 'text-gray-500',
                    )}
                />
            </button>
            <button onClick={redo} disabled={!canRedo} className={buttonStyles}>
                <Icon
                    name="RedoArrow"
                    className={twMerge(
                        canRedo ? 'active:opacity-50' : 'text-gray-500',
                    )}
                />
            </button>
        </div>
    );
}
