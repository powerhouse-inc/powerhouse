import { useState } from 'react';
import { Key } from 'react-aria-components';
import { EditorProps } from 'document-model/document';
import {
    RealWorldAssetsState,
    RealWorldAssetsLocalState,
    RealWorldAssetsAction,
} from '../../document-models/real-world-assets';
import { TabPanel } from 'react-aria-components';
import { RWATabs } from '@powerhousedao/design-system';
import { Portfolio } from './portfolio';
import { Transactions } from './transactions';
import { Attachments } from './attachments';

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
                        <Portfolio />
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
