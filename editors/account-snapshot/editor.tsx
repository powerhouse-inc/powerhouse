import {
    ThemeProvider,
    AccountsSnapshot,
    ResourceType,
} from 'dspot-powerhouse-components';
import { EditorProps } from 'document-model-editors';

import { accountSnapshotStateToSnapshot } from './helpers';
import {
    actions,
    AccountSnapshotState,
    AccountSnapshotAction,
} from '../../document-models/account-snapshot';

export type IProps = EditorProps<AccountSnapshotState, AccountSnapshotAction>;

export const AccountSnapshotEditor = (props: IProps) => {
    const { document, dispatch, editorContext } = props;
    const { state } = document;

    const isLight = editorContext?.theme === 'light';

    return (
        <ThemeProvider isLight={isLight}>
            <AccountsSnapshot
                resourceType={ResourceType.EcosystemActor}
                sinceDate={new Date('2021-01-01')}
                snapshotOwner="Mock Ecosystem Actor"
                snapshot={accountSnapshotStateToSnapshot(state)}
            />
        </ThemeProvider>
    );
};

export default AccountSnapshotEditor;
