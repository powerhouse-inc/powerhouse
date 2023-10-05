import { EditorProps } from 'document-model-editors';
import {
    actions,
    AccountSnapshotState,
    AccountSnapshotAction,
} from '../../document-models/account-snapshot';

export type IProps = EditorProps<AccountSnapshotState, AccountSnapshotAction>;

export const AccountSnapshotEditor = (props: IProps) => {
    const { document, dispatch, editorContext } = props;
    const { state } = document;

    return <div>Hello World</div>;
};

export default AccountSnapshotEditor;
