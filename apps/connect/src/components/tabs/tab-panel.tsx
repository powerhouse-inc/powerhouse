import { Document } from '@acaldas/document-model-libs/document';
import { useRef } from 'react';
import { useTabList, useTabPanel } from 'react-aria';
import { TabListState } from 'react-stately';
import { Tab } from 'src/store/tabs';
import TabNew from './tab-new';

export default function ({
    state,
    onUpdateTab,
    ...props
}: Parameters<typeof useTabList>[0] & {
    state: TabListState<Tab>;
    onUpdateTab: (tab: Tab) => void;
}) {
    const ref = useRef(null);
    const { tabPanelProps } = useTabPanel(props, state, ref);
    const Editor = state.selectedItem?.value?.content || TabNew;

    function updateTab(document: Document) {
        if (!state.selectedItem.value) {
            return;
        }
        onUpdateTab({
            ...state.selectedItem.value,
            name: document.name || state.selectedItem?.value?.name,
            document,
        });
    }
    return (
        <div className="flex-1 bg-bg p-6" {...tabPanelProps} ref={ref}>
            <Editor
                document={state.selectedItem?.value?.document}
                onChange={updateTab}
            />
        </div>
    );
}
