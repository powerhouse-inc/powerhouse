import { useDocumentDriveServer } from '#hooks/useDocumentDriveServer';
import { useUnwrappedReactor } from '#store/reactor';
import { gql, request } from 'graphql-request';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const REACTOR_URL = 'http://localhost:4001/';

async function forkAtlas(docId: string): Promise<{ ForkAtlas: string }> {
    const document = gql`
        mutation ForkAtlas($docId: PHID) {
            ForkAtlas(docId: $docId)
        }
    `;
    return await request(`${REACTOR_URL}fork`, document, { docId });
}

export function AtlasImport() {
    const status = useRef<
        'initial' | 'forking' | 'forked' | 'addingDrive' | 'done' | 'error'
    >('initial');
    const reactor = useUnwrappedReactor();
    const { documentId } = useParams();
    const navigate = useNavigate();
    const { addRemoteDrive } = useDocumentDriveServer();
    const [driveId, setDriveId] = useState<string | undefined>(undefined);
    const [error, setError] = useState<unknown>(undefined);

    async function forkAtlasDocument(documentId: string) {
        const result = await forkAtlas(documentId);
        const driveId = result.ForkAtlas;
        status.current = 'forked';
        setDriveId(driveId);
    }

    const addForkDrive = useCallback(
        async (driveId: string) => {
            console.log('Adding remote drive:', driveId);
            const driveUrl = `${REACTOR_URL}d/${driveId}`;
            try {
                const addedDrive = await addRemoteDrive(driveUrl, {
                    sharingType: 'PUBLIC',
                    availableOffline: true,
                    listeners: [
                        {
                            block: true,
                            callInfo: {
                                data: driveUrl,
                                name: 'switchboard-push',
                                transmitterType: 'SwitchboardPush',
                            },
                            filter: {
                                branch: ['main'],
                                documentId: ['*'],
                                documentType: ['*'],
                                scope: ['global'],
                            },
                            label: 'Switchboard Sync',
                            listenerId: '1',
                            system: true,
                        },
                    ],
                    triggers: [],
                    pullInterval: 3000,
                });
                status.current = 'done';
                console.log('Added remote drive:', addedDrive);
                navigate(`/d/${driveId}`, { replace: true });
            } catch (error) {
                status.current = 'error';
                setError(error);
            }
        },
        [addRemoteDrive, navigate],
    );

    useEffect(() => {
        if (!documentId || status.current !== 'initial') return;
        status.current = 'forking';
        forkAtlasDocument(documentId).catch(error => {
            status.current = 'error';
            setError(error);
        });
    }, [documentId, status]);

    useEffect(() => {
        if (!driveId || !reactor || status.current !== 'forked') return;
        status.current = 'addingDrive';
        new Promise<void>(resolve => {
            setTimeout(resolve, 500);
        })
            .then(() => addForkDrive(driveId))
            .catch(setError);
    }, [driveId, reactor, status]);

    return (
        <div className="p-10">
            <h1 className="font-semibold mb-4">Atlas Import</h1>
            {error ? (
                <div>
                    Error:{' '}
                    {error instanceof Error
                        ? error.message
                        : JSON.stringify(error)}
                </div>
            ) : !driveId ? (
                <div>Forking {documentId}...</div>
            ) : (
                <div>Adding fork drive: {driveId}</div>
            )}
        </div>
    );
}
