import { useDocumentDriveServer } from '#hooks';
import { CreateDocumentModal as ConnectCreateDocumentModal } from '@powerhousedao/design-system';
import {
    makeDriveUrlComponent,
    makeNodeUrlComponent,
    useSelectedParentFolder,
    useSetSelectedNode,
    useUnwrappedSelectedDrive,
    useUnwrappedSelectedFolder,
} from '@powerhousedao/state';
import { type DocumentModelModule } from 'document-model';

export interface CreateDocumentModalProps {
    open: boolean;
    documentModel: DocumentModelModule;
    onClose: () => void;
}

export const CreateDocumentModal: React.FC<
    CreateDocumentModalProps
> = props => {
    const { open, documentModel, onClose } = props;
    const selectedDrive = useUnwrappedSelectedDrive();
    const setSelectedNode = useSetSelectedNode();
    const selectedFolder = useUnwrappedSelectedFolder();
    const parentFolder = useSelectedParentFolder();
    const { addDocument } = useDocumentDriveServer();

    const onCreateDocument = async (documentName: string) => {
        onClose();
        if (!selectedDrive) return;

        const node = await addDocument(
            selectedDrive.header.id,
            documentName || `New ${documentModel.documentModel.name}`,
            documentModel.documentModel.id,
            selectedFolder?.id ?? parentFolder?.id,
        );

        if (node) {
            setSelectedNode(node.id, false);
            if (typeof window !== 'undefined') {
                const driveSlug = makeDriveUrlComponent(selectedDrive);
                const nodeSlug = makeNodeUrlComponent(node);
                window.history.pushState(
                    null,
                    '',
                    `/d/${driveSlug}/${nodeSlug}`,
                );
            }
        }
    };

    return (
        <ConnectCreateDocumentModal
            open={open}
            onContinue={onCreateDocument}
            onOpenChange={(status: boolean) => {
                if (!status) return onClose();
            }}
        />
    );
};
