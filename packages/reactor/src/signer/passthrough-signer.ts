import type { Signature } from "document-model";
import type { ISigner } from "./types.js";

export class PassthroughSigner implements ISigner {
  sign(): Promise<Signature> {
    return Promise.resolve(["", "", "", "", ""]);
  }
}
