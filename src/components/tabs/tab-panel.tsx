import { useRef } from 'react';
import { useTabList, useTabPanel } from 'react-aria';
import { TabListState } from 'react-stately';
import { Tab } from '../../store/tabs';
import TabNew from './tab-new';

export default function ({
    state,
    ...props
}: Parameters<typeof useTabList>[0] & {
    state: TabListState<Tab>;
}) {
    const ref = useRef(null);
    const { tabPanelProps } = useTabPanel(props, state, ref);
    return (
        <div className="flex-1 bg-bg p-6" {...tabPanelProps} ref={ref}>
            {state.selectedItem?.value?.content() ?? <TabNew />}
        </div>
    );
}
