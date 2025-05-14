import {
  type IBaseDocumentDriveServer,
  type IListenerManager,
  type ITransmitterFactory,
  type Listener,
} from "#server/types";
import { PullResponderTransmitter } from "./pull-responder.js";
import { SwitchboardPushTransmitter } from "./switchboard-push.js";
import { type ITransmitter } from "./types.js";

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

        return new SwitchboardPushTransmitter(listener.callInfo.data);
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
