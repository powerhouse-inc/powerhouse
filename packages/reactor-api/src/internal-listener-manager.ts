import {
  BaseDocumentDriveServer,
  InternalTransmitter,
  InternalTransmitterUpdate,
  Listener,
} from "document-drive";
import { DocumentDriveDocument } from "document-model-libs/document-drive";

export type InternalListenerModule = {
  name: string;
  options: Omit<Listener, "driveId">;
  transmit: (strands: InternalTransmitterUpdate[]) => Promise<void>;
};

export class InternalListenerManager {
  private driveServer: BaseDocumentDriveServer;
  private modules: InternalListenerModule[] = [];

  constructor(driveServer: BaseDocumentDriveServer) {
    this.driveServer = driveServer;
    driveServer.on("driveAdded", this.#onDriveAdded.bind(this));
  }

  async #onDriveAdded(drive: DocumentDriveDocument) {
    await Promise.all(
      this.modules.map((module) =>
        this.driveServer.addInternalListener(
          drive.state.global.id,
          {
            transmit: (strands) => module.transmit(strands),
            disconnect: async () => {
              return Promise.resolve();
            },
          },
          { ...module.options, label: module.options.label ?? "" }
        )
      )
    );
  }

  async init() {
    const drives = await this.driveServer.getDrives();

    // eslint-disable-next-line no-restricted-syntax
    for (const { options, transmit } of this.modules) {
      console.log(options, transmit);
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
              (l) => l.listenerId === listenerId
            ).length > 0;
          if (!moduleRegistered) {
            await this.driveServer.addInternalListener(
              driveId,
              {
                transmit: async (strands) => transmit(strands),
                disconnect: async () => Promise.resolve(),
              },
              {
                block: false,
                filter: options.filter,
                label: options.label!,
                listenerId,
              }
            );

            return;
          }

          const transmitter = await this.driveServer.getTransmitter(
            driveId,
            listenerId
          );
          if (transmitter instanceof InternalTransmitter) {
            transmitter.setReceiver({
              transmit: async (strands: InternalTransmitterUpdate[]) => {
                await transmit(strands);
                return Promise.resolve();
              },
              disconnect: () => {
                console.log(`Disconnecting listener ${options.listenerId}`);
                return Promise.resolve();
              },
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

  async registerInternalListener(module: InternalListenerModule) {
    if (this.modules.find((m) => m.name === module.name)) {
      return;
    }
    this.modules.push(module);
    await this.init();
  }
}
