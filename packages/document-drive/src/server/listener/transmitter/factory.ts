import type {
  IBaseDocumentDriveServer,
  IListenerManager,
  ITransmitter,
  ITransmitterFactory,
  ServerListener,
} from "document-drive";
import {
  PullResponderTransmitter,
  SwitchboardPushTransmitter,
} from "document-drive";

export class TransmitterFactory implements ITransmitterFactory {
  private readonly listenerManager: IListenerManager;

  constructor(listenerManager: IListenerManager) {
    this.listenerManager = listenerManager;
  }

  instance(
    transmitterType: string,
    listener: ServerListener,
    driveServer: IBaseDocumentDriveServer,
  ): ITransmitter {
    switch (transmitterType) {
      case "SwitchboardPush": {
        if (!listener.callInfo?.data) {
          throw new Error("No call info data: " + JSON.stringify(listener));
        }

        return new SwitchboardPushTransmitter(
          listener.callInfo.data,
          this.listenerManager,
        );
      }
      case "Internal": {
        throw new Error("Internal transmitter not implemented");
      }
      default: {
        return new PullResponderTransmitter(listener, this.listenerManager);
      }
    }
  }
}
