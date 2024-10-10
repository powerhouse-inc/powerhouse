import {
    BaseDocumentDriveServer,
    InternalTransmitter,
    InternalTransmitterUpdate,
    Listener,
} from 'document-drive';
import { DocumentDriveDocument } from 'document-model-libs/document-drive';
import * as rwaListener from '../subgraphs/rwa-read-model/listener';

type InternalListenerModule = {
    name: string;
    options: Omit<Listener, 'driveId'>;
    transmit: (
        strands: InternalTransmitterUpdate<DocumentDriveDocument, 'global'>[],
    ) => Promise<void>;
};

export class InternalListenerManager {
    private driveServer: BaseDocumentDriveServer;
    private modules: InternalListenerModule[] = [
        {
            name: 'rwa-read-model',
            options: rwaListener.options,
            transmit: rwaListener.transmit,
        },
    ];

    constructor(driveServer: BaseDocumentDriveServer) {
        this.driveServer = driveServer;
        driveServer.on('documentModels', documentModels => {
            console.log('documentModels', documentModels);
        });

        driveServer.on('driveAdded', this.#onDriveAdded.bind(this));

        driveServer.on('driveDeleted', driveId => {
            console.log('driveRemoved', driveId);
        });
    }

    async #onDriveAdded(drive: DocumentDriveDocument) {
        await Promise.all(
            this.modules.map(module =>
                this.driveServer.addInternalListener(
                    drive.state.global.id,
                    {
                        transmit: module.transmit,
                        disconnect: async () => {
                            console.log('disconnect', drive.state.global.id);
                            return Promise.resolve();
                        },
                    },
                    { ...module.options, label: module.options.label ?? '' },
                ),
            ),
        );

        console.log(
            'listener added',
            this.modules.map(module => module.name),
        );
    }

    async init() {
        const drives = await this.driveServer.getDrives();
        // eslint-disable-next-line no-restricted-syntax
        for (const { options, transmit } of this.modules) {
            if (!options || !transmit) {
                continue;
            }

            // eslint-disable-next-line no-restricted-syntax
            for (const driveId of drives) {
                try {
                    const { listenerId } = options;
                    const drive = await this.driveServer.getDrive(driveId);
                    const moduleRegistered =
                        drive.state.local.listeners.filter(
                            l => l.listenerId === listenerId,
                        ).length > 0;
                    if (!moduleRegistered) {
                        continue;
                    }

                    const transmitter = await this.driveServer.getTransmitter(
                        driveId,
                        listenerId,
                    );
                    if (transmitter instanceof InternalTransmitter) {
                        transmitter.setReceiver({
                            transmit: async (
                                strands: InternalTransmitterUpdate<
                                    DocumentDriveDocument,
                                    'global'
                                >[],
                            ) => {
                                await transmit(strands);
                                return Promise.resolve();
                            },
                            disconnect: () => {
                                console.log(
                                    `Disconnecting listener ${options.listenerId}`,
                                );
                                return Promise.resolve();
                            },
                        });
                    }
                } catch (e) {
                    console.error(
                        `Error while initializing listener ${options.listenerId} for drive ${driveId}`,
                        e,
                    );
                }
            }
        }
    }
}
