import { useUnwrappedReactor } from '#store/reactor';
import {
    useDocument,
    useDocumentEditorProps,
} from '@powerhousedao/reactor-browser';
import { DocumentModelModule, PHDocument } from 'document-model';

import { useConnectCrypto, useConnectDid } from './useConnectCrypto';

export interface DocumentEditorProps {
    driveId: string;
    documentId: string;
    documentType: string;
    documentModelModule: DocumentModelModule<PHDocument>;
}

export function useDocumentEditor(props: DocumentEditorProps) {
    const { driveId, documentId, documentType, documentModelModule } = props;

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
    });

    return documentEditorProps;
}
