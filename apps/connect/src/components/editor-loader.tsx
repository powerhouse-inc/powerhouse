import { DefaultEditorLoader } from '@powerhousedao/design-system';
import { ReactNode } from 'react';

type Props = {
    customEditorLoader?: ReactNode;
};
export function EditorLoader(props: Props) {
    const { customEditorLoader } = props;

    if (customEditorLoader) return <>{customEditorLoader}</>;

    return <DefaultEditorLoader />;
}
