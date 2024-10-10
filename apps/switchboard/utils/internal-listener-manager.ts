import { BaseDocumentDriveServer, InternalTransmitter, InternalTransmitterUpdate } from "document-drive";
import { DocumentDriveDocument, DocumentDriveState } from "document-model-libs/document-drive";
import * as rwaListener from '../subgraphs/rwa-read-model/listener';
export class InternalListenerManager {

    private driveServer: BaseDocumentDriveServer;
    private modules: any[] = [{
        name: "rwa-read-model",
        options: rwaListener.options,
        transmit: rwaListener.transmit
    }];

    constructor(driveServer: BaseDocumentDriveServer) {
        this.driveServer = driveServer;
        driveServer.on("documentModels", async (documentModels) => {
            console.log("documentModels", documentModels);
        });

        driveServer.on("driveAdded", this.#onDriveAdded.bind(this));

        driveServer.on("driveDeleted", async (driveId) => {
            console.log("driveRemoved", driveId);
        });
    }

    async #onDriveAdded(drive: DocumentDriveDocument) {
        await Promise.all(this.modules.map((module) =>
            this.driveServer.addInternalListener(
                drive.state.global.id,
                {
                    transmit: module.transmit, disconnect: async () => {
                        console.log("disconnect", drive.state.global.id);
                    },
                },
                module.options
            )
        ));

        console.log("listener added", this.modules.map((module) => module.options.listenerId));
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
                    const drive = await this.driveServer.getDrive(driveId);
                    const moduleRegistered = drive.state.local.listeners.filter(l => l.listenerId === options.listenerId).length > 0;
                    if (!moduleRegistered) {
                        continue;
                    }

                    const transmitter = await this.driveServer.getTransmitter(
                        driveId,
                        options.listenerId
                    );
                    if (transmitter instanceof InternalTransmitter) {
                        transmitter.setReceiver({
                            transmit: async (strands: InternalTransmitterUpdate[]) => {
                                transmit(strands);
                            },
                            disconnect: async () => {
                                console.log(`Disconnecting listener ${options.listenerId}`);
                            }
                        });
                    }
                } catch (e) {
                    console.error(
                        `Error while initializing listener ${options.listenerId} for drive ${driveId}`,
                        e
                    );
                }
            }
        }
    }
}
