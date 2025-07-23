import { type PowerhouseConfig } from "@powerhousedao/config/powerhouse";
import { type IProcessor } from "document-drive/processors/types";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
// import { type DocumentModelDocument, type DocumentModelState } from "document-model";
import { type DocumentModelDocument } from "document-model";
import fs from 'fs';
import path from 'path';

// TODO: read this from project root
const PH_CONFIG = JSON.parse(fs.readFileSync(path.join('./powerhouse.config.json'), 'utf8')) as PowerhouseConfig;

export class CodegenProcessor implements IProcessor {
  async onStrands<TDocument extends DocumentModelDocument>(
    strands: InternalTransmitterUpdate<TDocument>[],
  ): Promise<void> {
    console.log('>>>> codegenProcessor onStrands', strands);
    for (const strand of strands) {
      // await generateFromDocument(strand.state as DocumentModelState, PH_CONFIG)
    }
  }

  async onDisconnect() {}
}
