import AtlasIcon from '#assets/icons/Atlas-Logomark.svg?react';
import RefreshIcon from '#assets/icons/refresh.svg?react';
import { useDocumentDriveServer } from '#hooks';
import { useUnwrappedReactor } from '#store';
import { Button } from '@powerhousedao/design-system';
import { gql, request } from 'graphql-request';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const REACTOR_URL = 'http://localhost:4001/';
const MIN_LOADING_TIME = 2000;

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
    const [loading, setLoading] = useState(true);

    async function forkAtlasDocument(documentId: string) {
        const result = await forkAtlas(documentId);
        const driveId = result.ForkAtlas;
        status.current = 'forked';
        setDriveId(driveId);
    }

    const redirectToDrive = useCallback(() => {
        if (driveId && !loading) {
            navigate(`/d/${driveId}`, { replace: true });
        }
    }, [driveId, navigate, loading]);

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
                });
                status.current = 'done';
                console.log('Added remote drive:', addedDrive);
                setTimeout(() => {
                    setLoading(false);
                }, MIN_LOADING_TIME);
            } catch (error) {
                status.current = 'error';
                setLoading(false);
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
        <div className="bg-gray-50 size-full flex justify-center gap-x-4">
            <div className="bg-white rounded-2xl w-full max-w-[850px] drop-shadow-sm p-6">
                <h1 className="text-lg text-gray-900 font-medium">
                    Welcome to the Atlas Explorer
                </h1>
                <div className="mt-4 bg-gray-50 border border-gray-200 rounded-xl p-6">
                    <div className="bg-slate-50 rounded-2xl min-h-80 flex flex-col justify-center items-center">
                        <div>
                            <AtlasIcon />
                        </div>
                        <div className="text-sm text-gray-500 mt-3">
                            Forking Atlas scope...
                        </div>

                        <Button
                            onClick={redirectToDrive}
                            size="small"
                            color="light"
                            className="bg-white border border-gray-200 h-9 px-3 mt-4 text-gray-600"
                        >
                            {loading ? (
                                <>
                                    <RefreshIcon className="animate-spin" />
                                    Loading
                                </>
                            ) : (
                                'Continue'
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
