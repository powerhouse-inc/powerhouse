import { RWATabs, RWATabsProps } from '@powerhousedao/design-system';
import { EditorProps, actions } from 'document-model/document';
import { useState } from 'react';
import { Key, TabPanel } from 'react-aria-components';
import {
    RealWorldAssetsAction,
    RealWorldAssetsLocalState,
    RealWorldAssetsState,
} from '../../document-models/real-world-assets';
import { Attachments } from './attachments';
import { Portfolio } from './portfolio';
import { Transactions } from './transactions';

export type CustomEditorProps = Pick<RWATabsProps, 'onClose' | 'onExport'>;

export type IProps = EditorProps<
    RealWorldAssetsState,
    RealWorldAssetsAction,
    RealWorldAssetsLocalState
> &
    CustomEditorProps;

function Editor(props: IProps) {
    const { document, dispatch, onClose, onExport } = props;

    const [activeTab, setActiveTab] = useState<Key>('portfolio');

    const undo = () => dispatch(actions.undo());
    const redo = () => dispatch(actions.redo());

    const canUndo = document.revision.global > 0 || document.revision.local > 0;
    const canRedo = document.clipboard.length > 0;

    return (
        <RWATabs
            onClose={onClose}
            onExport={onExport}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            selectedKey={activeTab}
            onSelectionChange={key => setActiveTab(key)}
            disabledKeys={['attachments']}
            tabs={[
                { id: 'portfolio', label: 'Portfolio' },
                { id: 'transactions', label: 'Transactions' },
                { id: 'attachments', label: 'Attachments' },
            ]}
        >
            <div className="flex justify-center mt-3">
                <div className="w-full rounded-md bg-slate-50 p-8">
                    <TabPanel id="portfolio">
                        <Portfolio {...props} />
                    </TabPanel>
                    <TabPanel id="transactions">
                        <Transactions />
                    </TabPanel>
                    <TabPanel id="attachments">
                        <Attachments />
                    </TabPanel>
                </div>
            </div>
        </RWATabs>
    );
}

export default Editor;
