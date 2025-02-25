import {
  IBaseDocumentDriveServer,
  IListenerManager,
  ITransmitterFactory,
  Listener,
} from "#server/types";
import { InternalTransmitter } from "./internal.js";
import { PullResponderTransmitter } from "./pull-responder.js";
import { SwitchboardPushTransmitter } from "./switchboard-push.js";
import { ITransmitter } from "./types.js";

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
        if (!listener.callInfo?.data) {
          throw new Error("No call info data: " + JSON.stringify(listener));
        }

        return new SwitchboardPushTransmitter(listener.callInfo!.data);
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
