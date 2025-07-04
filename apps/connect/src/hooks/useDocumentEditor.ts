import { useUnwrappedReactor } from '#store';
import {
    useDocument,
    useDocumentEditorProps,
    type User,
} from '@powerhousedao/reactor-browser';
import { type DocumentModelModule, type PHDocument } from 'document-model';

import { useConnectCrypto, useConnectDid } from '#hooks';

export interface DocumentEditorProps {
    driveId: string;
    documentId: string;
    documentType: string;
    documentModelModule: DocumentModelModule<PHDocument>;
    user?: User;
}

export function useDocumentEditor(props: DocumentEditorProps) {
    const { driveId, documentId, documentType, documentModelModule, user } =
        props;

    const reactor = useUnwrappedReactor();
    const connectDid = useConnectDid();
    const { sign } = useConnectCrypto();

    const doc = useDocument(reactor, { documentId, documentType });

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
