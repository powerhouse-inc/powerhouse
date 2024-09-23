import { EditorActionButtons } from '@/connect';
import { PORTFOLIO, TabComponents } from '@/rwa';
import { Content, List, Root, Trigger } from '@radix-ui/react-tabs';

export type RWATabsProps = {
    readonly tabComponents: TabComponents;
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    readonly onClose: () => void;
    readonly onExport: () => void;
    readonly undo: () => void;
    readonly redo: () => void;
    readonly onShowRevisionHistory: () => void;
    readonly onSwitchboardLinkClick: (() => void) | undefined;
};

export function RWATabs(props: RWATabsProps) {
    const { tabComponents } = props;

    return (
        <Root defaultValue={PORTFOLIO}>
            <div className="flex justify-between">
                {/* <EditorUndoRedoButtons {...props} /> */}
                <List className="flex gap-x-2 rounded-xl bg-slate-50 p-1 text-sm font-semibold text-gray-600 outline-none">
                    {tabComponents.map(({ value, label, disabled }) => (
                        <Trigger
                            className="data-[state='active']:tab-shadow data-disabled:cursor-not-allowed data-disabled:text-gray-400 h-7 w-32 rounded-lg  transition duration-300 data-[state='active']:bg-gray-50 data-[state='active']:text-gray-900"
                            disabled={disabled}
                            key={value}
                            value={value}
                        >
                            {label}
                        </Trigger>
                    ))}
                </List>
                <EditorActionButtons {...props} />
            </div>
            <div className="mt-3 rounded-md bg-slate-50 p-8">
                {tabComponents.map(({ value, Component }) => (
                    <Content key={value} value={value}>
                        <Component />
                    </Content>
                ))}
            </div>
        </Root>
    );
}
