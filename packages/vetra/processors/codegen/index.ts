import { generateFromDocument, validateDocumentModelState } from "@powerhousedao/codegen";
import { type PowerhouseConfig } from "@powerhousedao/config/powerhouse";
import { type IProcessor } from "document-drive/processors/types";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import { type DocumentModelDocument, type DocumentModelState } from "document-model";
import fs from 'fs';
import path from 'path';

// TODO: read this from project root
const PH_CONFIG = JSON.parse(fs.readFileSync(path.join('./powerhouse.config.json'), 'utf8')) as PowerhouseConfig;

export class CodegenProcessor implements IProcessor {
  async onStrands<TDocument extends DocumentModelDocument>(
    strands: InternalTransmitterUpdate<TDocument>[],
  ): Promise<void> {
    console.log('>>>> codegenProcessor onStrands:');
    console.dir(strands, { depth: null });
    for (const strand of strands) {
      const state = strand.state as DocumentModelState;
      const validationResult = validateDocumentModelState(state);
      console.log('>>>> validationResult', validationResult);
      if (validationResult.isValid) {
        await generateFromDocument(state, PH_CONFIG)
      }
    }
  }

  async onDisconnect() {}
}
