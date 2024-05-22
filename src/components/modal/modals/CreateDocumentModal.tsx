import {
    RenameNodeModal,
    TreeItem,
    decodeID,
} from '@powerhousedao/design-system';
import { Node } from 'document-model-libs/document-drive';
import { DocumentModel } from 'document-model/document';
import React, { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';

export interface CreateDocumentModalProps {
    open: boolean;
    driveID: string;
    documentModel: DocumentModel;
    selectedFolder?: TreeItem;
    onClose: () => void;
    driveNodes?: Node[];
    setSelectedFileNode?: Dispatch<
        SetStateAction<
            | {
                  drive: string;
                  id: string;
                  parentFolder: string | null;
              }
            | undefined
        >
    >;
}

export const CreateDocumentModal: React.FC<
    CreateDocumentModalProps
> = props => {
    const {
        open,
        onClose,
        driveID,
        selectedFolder,
        setSelectedFileNode,
        driveNodes,
        documentModel,
    } = props;

    const { t } = useTranslation();
    const { addDocument } = useDocumentDriveServer();

    const onCreateDocument = async (documentName: string) => {
        onClose();

        if (!driveID || !selectedFolder) {
            throw new Error('No drive selected');
        }

        // remove first segment of path
        const parentFolder = selectedFolder.path.split('/').slice(1).pop();

        const node = await addDocument(
            driveID,
            documentName || `New ${documentModel.documentModel.name}`,
            documentModel.documentModel.id,
            parentFolder ? decodeID(parentFolder) : undefined,
        );

        if (node) {
            if (!driveNodes) {
                throw new Error(`Drive with id ${driveID} not found`);
            }
            setSelectedFileNode?.({
                drive: driveID,
                id: node.id,
                parentFolder: node.parentFolder,
            });
        }
    };

    return (
        <RenameNodeModal
            open={open}
            header={t('modals.createDocument.header')}
            placeholder={t('modals.createDocument.placeholder')}
            cancelLabel={t('common.cancel')}
            continueLabel={t('common.create')}
            onContinue={onCreateDocument}
            onOpenChange={status => {
                if (!status) return onClose();
            }}
        />
    );
};
