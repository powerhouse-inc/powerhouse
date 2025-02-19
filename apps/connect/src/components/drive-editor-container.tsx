import { DocumentDrive, GenericDriveExplorer } from '@powerhousedao/common';
import { UiDriveNode, useUiNodesContext } from '@powerhousedao/design-system';
import { EditorContext } from 'document-model/document';
import { useAtomValue } from 'jotai';
import { useMemo } from 'react';
import { useDocumentDriveById } from 'src/hooks/useDocumentDriveById';
import { themeAtom } from 'src/store/theme';
import { useUser } from 'src/store/user';
import { useDocumentDispatch } from 'src/utils/document-model';

function useEditorContext(): EditorContext {
    const theme = useAtomValue(themeAtom);
    const user = useUser() || undefined;
    return useMemo(() => ({ theme, user }), [theme, user]);
}

function useDocumentDrive(driveId: string) {
    const { selectedDriveNode } = useUiNodesContext();

    const selectedDriveNode = uiNodes.selectedDriveNode as UiDriveNode | null;
    if (!selectedDriveNode) {
        throw new Error('No drive node selected');
    }

    const documentDrive = useDocumentDriveById(selectedDriveNode.id);

    if (!documentDrive.drive) {
        throw new Error(`Drive with id "${selectedDriveNode.id}" not found`);
    }
}

export function DriveEditorContainer() {
    const editorContext = useEditorContext();
    const uiNodes = useUiNodesContext();

    const selectedDriveNode = uiNodes.selectedDriveNode as UiDriveNode | null;
    if (!selectedDriveNode) {
        throw new Error('No drive node selected');
    }

    const documentDrive = useDocumentDriveById(selectedDriveNode.id);

    if (!documentDrive.drive) {
        throw new Error(`Drive with id "${selectedDriveNode.id}" not found`);
    }

    const [document, _dispatch, error] = useDocumentDispatch(
        DocumentDrive.reducer,
        documentDrive.drive,
    );

    if (!document) {
        return null;
    }

    return (
        <GenericDriveExplorer.Component
            document={document}
            dispatch={_dispatch}
            error={error}
            context={editorContext}
        />
    );
}
