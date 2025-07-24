import {
    useDocument,
    useDocumentEditorProps,
    type User,
} from '@powerhousedao/reactor-browser';
import { type DocumentModelModule, type PHDocument } from 'document-model';

import { useConnectCrypto, useConnectDid } from '#hooks';
import { useUnwrappedReactor } from '@powerhousedao/state';

export interface DocumentEditorProps {
    driveId: string | undefined;
    documentId: string | undefined;
    documentType: string | undefined;
    documentModelModule: DocumentModelModule<PHDocument> | undefined;
    user?: User;
}

export function useDocumentEditor(props: DocumentEditorProps) {
    const { driveId, documentId, documentType, documentModelModule, user } =
        props;

    const reactor = useUnwrappedReactor();
    const connectDid = useConnectDid();
    const { sign } = useConnectCrypto();

    const doc = useDocument(reactor, { documentId, driveId, documentType });

    const documentEditorProps = useDocumentEditorProps(reactor, {
        nodeId: documentId,
        driveId: driveId,
        document: doc,
        documentModelModule,
        connectDid,
        sign,
        user,
    });

    return documentEditorProps;
}
