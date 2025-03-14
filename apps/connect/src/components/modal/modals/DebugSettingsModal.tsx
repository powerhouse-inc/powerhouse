/* eslint-disable @typescript-eslint/no-unsafe-call */
import { useConnectConfig, useDocumentDriveServer } from '#hooks';
import { serviceWorkerManager } from '#utils';
import {
    Button,
    Combobox,
    FormInput,
    Icon,
    Modal,
} from '@powerhousedao/design-system';
import { useEffect, useState } from 'react';
import { v4 as uuid } from 'uuid';
export interface DebugSettingsModalProps {
    open: boolean;
    onClose: () => void;
}

type ComboboxOption = {
    label: string;
    value: string;
};

export const DebugSettingsModal: React.FC<DebugSettingsModalProps> = props => {
    const [connectConfig] = useConnectConfig();
    const { open, onClose } = props;
    const autoRegisterPullResponder =
        localStorage.getItem('AUTO_REGISTER_PULL_RESPONDER') !== 'false';

    console.log('autoRegisterPullResponder', autoRegisterPullResponder);

    const [appVersion, setAppVersion] = useState(connectConfig.appVersion);
    const [serviceWorkerDebugMode, setServiceWorkerDebugMode] = useState({
        label: serviceWorkerManager.debug ? 'Enabled' : 'Disabled',
        value: serviceWorkerManager.debug,
    });
    const [selectedDrive, setSelectedDrive] = useState<string>();
    const [selectedDriveTrigger, setSelectedDriveTrigger] =
        useState<ComboboxOption | null>(null);
    const [driveUrl, setDriveUrl] = useState('');
    const [autoRegister, setAutoRegister] = useState<ComboboxOption>({
        label: autoRegisterPullResponder ? 'Enabled' : 'Disabled',
        value: autoRegisterPullResponder ? 'true' : 'false',
    });
    const {
        documentDrives,
        removeTrigger,
        addTrigger,
        registerNewPullResponderTrigger,
    } = useDocumentDriveServer();

    useEffect(() => {
        serviceWorkerManager.setDebug(serviceWorkerDebugMode.value);
    }, [serviceWorkerDebugMode]);

    console.log('documentDrives', documentDrives);
    console.log('selectedDrive', selectedDrive);

    const driveTriggers =
        documentDrives.find(drive => drive.state.global.id === selectedDrive)
            ?.state.local.triggers || [];

    const isEmptyURL = driveUrl === '';
    const disableUrlButtons = !selectedDrive || isEmptyURL;

    const removeTriggerHandler = async () => {
        if (!selectedDriveTrigger || !selectedDrive) return;

        await removeTrigger(selectedDrive, selectedDriveTrigger.value);
        setSelectedDriveTrigger(null);
    };

    const addTriggerHandler = async (invalid = false) => {
        if (!driveUrl || driveUrl === '' || !selectedDrive) return;

        if (!invalid) {
            const pullResponderTrigger = await registerNewPullResponderTrigger(
                selectedDrive,
                driveUrl,
                { pullInterval: 3000 },
            );
            await addTrigger(selectedDrive, pullResponderTrigger);
            setDriveUrl('');

            return;
        }

        await addTrigger(selectedDrive, {
            id: `invalid-trigger-${uuid()}`,
            type: 'PullResponder',
            data: {
                interval: '3000',
                listenerId: `ivalid-listener-${uuid()}`,
                url: driveUrl,
            },
        });
        setDriveUrl('');
    };

    const handleDisableAutoResiterPullResponder = (
        selectedOption: ComboboxOption,
    ) => {
        setAutoRegister(selectedOption);
        localStorage.setItem(
            'AUTO_REGISTER_PULL_RESPONDER',
            selectedOption.value,
        );
    };

    return (
        <Modal
            open={open}
            onOpenChange={status => {
                if (!status) return onClose();
            }}
            contentProps={{
                className: 'rounded-2xl',
            }}
        >
            <div className="w-[700px] rounded-2xl p-6">
                <div className="mb-6 flex justify-between">
                    <div className="text-xl font-bold">Debug Tools</div>
                    <button id="close-modal" onClick={() => onClose()}>
                        <Icon name="Xmark" size={28} />
                    </button>
                </div>

                <div className="flex text-sm font-bold">
                    <Icon name="Ring" size={22} />
                    <span className="ml-2">
                        App Version: {connectConfig.appVersion}
                    </span>
                </div>

                <div className="mt-4 flex text-sm font-bold">
                    <Icon name="Hdd" size={22} />
                    <span className="ml-2">Drive Tools:</span>
                </div>

                <div>
                    <label htmlFor="selectedDrive" className="text-xs">
                        Selected Drive:
                    </label>
                    <Combobox
                        id="selectedDrive"
                        onChange={value => {
                            if (
                                !value ||
                                !(typeof value === 'object') ||
                                !('value' in value)
                            ) {
                                setSelectedDrive(undefined);
                                setSelectedDriveTrigger(null);
                                return;
                            }

                            setSelectedDrive(value.value as string);
                            setSelectedDriveTrigger(null);
                        }}
                        options={documentDrives.map(drive => ({
                            label: drive.state.global.name,
                            value: drive.state.global.id,
                        }))}
                    />
                </div>

                <div className="mt-2 flex items-end justify-between pl-4">
                    <div className="w-[400px]">
                        <label
                            htmlFor="autoRegisterPullResponder"
                            className="text-xs"
                        >
                            Auto register pull responder:
                        </label>
                        <Combobox
                            id="autoRegisterPullResponder"
                            onChange={value => {
                                handleDisableAutoResiterPullResponder(
                                    value as ComboboxOption,
                                );
                            }}
                            value={autoRegister}
                            options={[
                                { label: 'Enabled', value: 'true' },
                                { label: 'Disabled', value: 'false' },
                            ]}
                        />
                    </div>
                </div>

                <div className="mt-2 flex items-end justify-between pl-4">
                    <div className="w-[400px]">
                        <label htmlFor="driveTrigger" className="text-xs">
                            Drive trigger:
                        </label>
                        <Combobox
                            id="driveTrigger"
                            onChange={value => {
                                setSelectedDriveTrigger(
                                    value as ComboboxOption,
                                );
                            }}
                            value={selectedDriveTrigger}
                            options={driveTriggers.map(trigger => ({
                                label: `${trigger.id} - ${trigger.type}`,
                                value: trigger.id,
                            }))}
                        />
                    </div>
                    <div>
                        <Button
                            onClick={removeTriggerHandler}
                            color={!selectedDriveTrigger ? 'light' : 'red'}
                            disabled={!selectedDriveTrigger}
                            size="small"
                        >
                            Remove Trigger
                        </Button>
                    </div>
                </div>

                <div className="mt-2 flex items-end justify-between pl-4">
                    <div className="w-[400px]">
                        <label htmlFor="driveUrl" className="text-xs">
                            Add drive trigger:
                        </label>
                        <FormInput
                            containerClassName="p-1 bg-white border border-gray-200 rounded-md text-sm"
                            inputClassName="text-xs font-normal"
                            id="driveUrl"
                            icon={
                                <div className="flex h-full items-center text-xs">
                                    URL:
                                </div>
                            }
                            value={driveUrl}
                            onChange={element =>
                                setDriveUrl(element.target.value)
                            }
                        />
                    </div>
                    <div className="mb-1 flex items-center justify-center">
                        <Button
                            className="mr-2"
                            color={disableUrlButtons ? 'light' : 'blue'}
                            size="small"
                            disabled={disableUrlButtons}
                            onClick={() => addTriggerHandler()}
                        >
                            Add Trigger
                        </Button>
                        <Button
                            color={disableUrlButtons ? 'light' : 'red'}
                            size="small"
                            disabled={disableUrlButtons}
                            onClick={() => addTriggerHandler(true)}
                        >
                            Add Invalid Trigger
                        </Button>
                    </div>
                </div>

                <div className="mt-4 flex text-sm font-bold">
                    <Icon name="Gear" size={22} />
                    <span className="ml-2">Service Worker Tools:</span>
                </div>

                <div className="mt-2 flex items-end justify-between pl-4">
                    <div className="w-[400px]">
                        <label
                            htmlFor="serviceWorkerDebugMode"
                            className="text-xs"
                        >
                            Service Worker Debug Mode:
                        </label>
                        <Combobox
                            id="serviceWorkerDebugMode"
                            onChange={value => {
                                setServiceWorkerDebugMode(
                                    value as typeof serviceWorkerDebugMode,
                                );
                            }}
                            value={serviceWorkerDebugMode}
                            options={[
                                { label: 'Enabled', value: true },
                                { label: 'Disabled', value: false },
                            ]}
                        />
                    </div>
                </div>

                <div className="mt-2 flex items-end justify-between pl-4">
                    <div className="w-[400px]">
                        <label htmlFor="appVersion" className="text-xs">
                            Set invalid app version:
                        </label>
                        <FormInput
                            containerClassName="p-1 bg-white border border-gray-200 rounded-md text-sm"
                            inputClassName="text-xs font-normal"
                            id="appVersion"
                            icon={
                                <div className="flex h-full items-center text-xs">
                                    Version:
                                </div>
                            }
                            value={appVersion}
                            onChange={element =>
                                setAppVersion(element.target.value)
                            }
                        />
                    </div>
                    <div className="mb-1 flex items-center justify-center">
                        <Button
                            color={appVersion === '' ? 'light' : 'red'}
                            size="small"
                            disabled={appVersion === ''}
                            onClick={() => {
                                // @ts-expect-error todo add send message method to service worker manager class
                                serviceWorkerManager.sendMessage({
                                    type: 'SET_APP_VERSION',
                                    version: appVersion,
                                });
                                setAppVersion('');
                            }}
                        >
                            Add Invalid App Version
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};
