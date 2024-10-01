import {
    OTHER,
    PORTFOLIO,
    RWATabs,
    RWATabsProps,
    TabComponents,
    TRANSACTIONS,
} from '@powerhousedao/design-system';
import { actions, EditorProps } from 'document-model/document';
import {
    RealWorldAssetsAction,
    RealWorldAssetsLocalState,
    RealWorldAssetsState,
} from '../../document-models/real-world-assets';
import { Other } from './other';
import { Portfolio } from './portfolio';
import { Transactions } from './transactions';

export type CustomEditorProps = Pick<
    RWATabsProps,
    'onClose' | 'onExport' | 'onSwitchboardLinkClick' | 'onShowRevisionHistory'
> & {
    readonly isAllowedToCreateDocuments: boolean;
    readonly isAllowedToEditDocuments: boolean;
};

export type IProps = EditorProps<
    RealWorldAssetsState,
    RealWorldAssetsAction,
    RealWorldAssetsLocalState
> &
    CustomEditorProps;

function Editor(props: IProps) {
    const {
        document: {
            revision: { global, local },
            clipboard,
        },
        dispatch,
    } = props;

    const undoProps = {
        undo: () => dispatch(actions.undo()),
        redo: () => dispatch(actions.redo()),
        canUndo: global > 0 || local > 0,
        canRedo: clipboard.length > 0,
    };

    const tabComponents: TabComponents = [
        {
            value: PORTFOLIO,
            label: 'Portfolio',
            // eslint-disable-next-line react/no-unstable-nested-components
            Component: () => <Portfolio {...props} />,
        },
        {
            value: TRANSACTIONS,
            label: 'Transactions',
            // eslint-disable-next-line react/no-unstable-nested-components
            Component: () => <Transactions {...props} />,
        },
        {
            value: OTHER,
            label: 'Other',
            // eslint-disable-next-line react/no-unstable-nested-components
            Component: () => <Other {...props} />,
        },
    ];

    return <RWATabs {...props} {...undoProps} tabComponents={tabComponents} />;
}

export default Editor;
