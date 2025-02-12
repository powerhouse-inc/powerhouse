import {
  InternalTransmitter,
  ITransmitter,
  PullResponderTransmitter,
  SwitchboardPushTransmitter,
} from ".";
import {
  IBaseDocumentDriveServer,
  IListenerManager,
  ITransmitterFactory,
  Listener,
} from "../../types";

export default class TransmitterFactory implements ITransmitterFactory {
  private readonly listenerManager: IListenerManager;

  constructor(listenerManager: IListenerManager) {
    this.listenerManager = listenerManager;
  }

  instance(
    transmitterType: string,
    listener: Listener,
    driveServer: IBaseDocumentDriveServer,
  ): ITransmitter {
    switch (transmitterType) {
      case "SwitchboardPush": {
        return new SwitchboardPushTransmitter(listener.callInfo!.data!);
      }
      case "Internal": {
        return new InternalTransmitter(listener, driveServer);
      }
      default: {
        return new PullResponderTransmitter(listener, this.listenerManager);
      }
    }
  }
}
