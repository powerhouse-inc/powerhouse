import { RWATabs } from '@powerhousedao/design-system';
import { EditorProps } from 'document-model/document';
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

export type IProps = EditorProps<
    RealWorldAssetsState,
    RealWorldAssetsAction,
    RealWorldAssetsLocalState
>;

function Editor(props: IProps) {
    const { document, dispatch } = props;

    const [activeTab, setActiveTab] = useState<Key>('portfolio');

    return (
        <RWATabs
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
