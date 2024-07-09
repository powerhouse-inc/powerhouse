import { PullResponderTrigger } from 'document-drive';
import {
    PullResponderTriggerData,
    Trigger,
} from 'document-model-libs/document-drive';
import { useCallback, useRef, useState } from 'react';
import { useDocumentDriveServer } from './useDocumentDriveServer';
import { useSwitchboard } from './useSwitchboard';

export type ClientErrorHandler = {
    strandsErrorHandler: (
        driveId: string,
        trigger: Trigger,
        status: number,
        errorMessage: string,
    ) => Promise<void>;
};

const DELAY_LIMIT = 100000;

const isListenerIdNotFound = (errorMessage: string, listenerId?: string) => {
    if (!listenerId) return false;

    return errorMessage
        .toLocaleLowerCase()
        .includes(`transmitter ${listenerId} not found`);
};

export const useClientErrorHandler = (): ClientErrorHandler => {
    const [handlingInProgress, setHandlingInProgress] = useState<string[]>([]);
    const [pullResponderTriggerMap, setPullResponderTriggerMap] = useState<
        Map<string, PullResponderTrigger>
    >(new Map());
    const {
        addTrigger,
        removeTrigger,
        registerNewPullResponderTrigger,
        renameDrive,
        addRemoteDrive,
        documentDrives,
        setDriveSharingType,
    } = useDocumentDriveServer();

    const { getDriveIdBySlug } = useSwitchboard();

    const pullResponderRegisterDelay = useRef<Map<string, number>>(new Map());

    const handleStrands400 = useCallback(
        async (driveId: string, trigger: Trigger, handlerCode: string) => {
            setHandlingInProgress(state => [...state, handlerCode]);

            const triggerData =
                trigger.data as unknown as PullResponderTriggerData;

            try {
                let pullResponderTrigger =
                    pullResponderTriggerMap.get(handlerCode);

                if (!pullResponderTrigger) {
                    pullResponderTrigger =
                        await registerNewPullResponderTrigger(
                            driveId,
                            triggerData.url,
                            {
                                pullInterval:
                                    Number(triggerData.interval) || 3000,
                            },
                        );

                    pullResponderTriggerMap.set(
                        handlerCode,
                        pullResponderTrigger,
                    );
                    setPullResponderTriggerMap(pullResponderTriggerMap);
                }

                await removeTrigger(driveId, trigger.id);
                await addTrigger(driveId, pullResponderTrigger);

                pullResponderRegisterDelay.current.delete(handlerCode);
            } catch (error) {
                const delay =
                    pullResponderRegisterDelay.current.get(handlerCode) || 1;
                pullResponderRegisterDelay.current.set(
                    handlerCode,
                    delay === DELAY_LIMIT ? delay : delay * 10,
                );

                console.error(error);
            } finally {
                setHandlingInProgress(state =>
                    state.filter(code => code !== handlerCode),
                );
            }
        },
        [
            pullResponderTriggerMap,
            removeTrigger,
            addTrigger,
            pullResponderRegisterDelay,
            registerNewPullResponderTrigger,
        ],
    );

    const handleDriveNotFound = useCallback(
        async (driveId: string, trigger: Trigger, handlerCode: string) => {
            setHandlingInProgress(state => [...state, handlerCode]);
            try {
                // get local drive by id
                const drive = documentDrives.find(
                    drive => drive.state.global.id === driveId,
                );
                if (!drive) return;
                await removeTrigger(driveId, trigger.id);

                // rename the drive old name (old)
                // check how many drives with the same name and old tag exist
                const amountOfCopies = documentDrives.filter(d => {
                    return d.state.global.name.includes(
                        drive.state.global.name,
                    );
                }).length;
                await renameDrive(
                    driveId,
                    drive.state.global.name + ` (${drive.state.global.id})`,
                );

                await setDriveSharingType(driveId, 'PRIVATE');

                if (trigger.data?.url && drive.state.global.slug) {
                    const newId = await getDriveIdBySlug(
                        trigger.data.url,
                        drive.state.global.slug,
                    );
                    // if newId provided add new remote drive
                    if (newId) {
                        const urlParts = trigger.data.url.split('/');
                        urlParts[urlParts.length - 1] = newId;
                        const newUrl = urlParts.join('/');

                        await addRemoteDrive(newUrl, {
                            availableOffline: true,
                            sharingType: 'PUBLIC',
                            listeners: [],
                            triggers: [],
                        });
                    }
                }
            } catch (e: any) {
                console.error(e);
            } finally {
                setHandlingInProgress(state =>
                    state.filter(code => code !== handlerCode),
                );
            }
        },
        [
            pullResponderTriggerMap,
            removeTrigger,
            addTrigger,
            pullResponderRegisterDelay,
            registerNewPullResponderTrigger,
        ],
    );

    const strandsErrorHandler: ClientErrorHandler['strandsErrorHandler'] =
        async (driveId, trigger, status, errorMessage) => {
            switch (status) {
                case 400: {
                    if (
                        isListenerIdNotFound(
                            errorMessage,
                            trigger.data?.listenerId,
                        )
                    ) {
                        const handlerCode = `strands:${driveId}:${status}`;

                        if (handlingInProgress.includes(handlerCode)) return;
                        if (!trigger.data) return;

                        const delay =
                            pullResponderRegisterDelay.current.get(
                                handlerCode,
                            ) || 0;

                        setTimeout(
                            () =>
                                handleStrands400(driveId, trigger, handlerCode),
                            delay,
                        );
                    }

                    break;
                }

                case 404: {
                    const handlerCode = `strands:${driveId}:${status}`;
                    if (handlingInProgress.includes(handlerCode)) return;
                    setTimeout(
                        () =>
                            handleDriveNotFound(driveId, trigger, handlerCode),
                        0,
                    );
                    break;
                }
            }
        };

    return { strandsErrorHandler };
};
