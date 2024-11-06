import { InternalTransmitterUpdate } from "document-drive";
import get from "./service";

export async function transmit(strands: InternalTransmitterUpdate[]) {
  for (const strand of strands) {
    handle(strand).catch((err) => {
      console.error('Error handling strand', err);
    });
  }

  return Promise.resolve();
}

async function handle(strand: InternalTransmitterUpdate) {
  const analytics = get();

  strand.operations.map((operation) => {
    console.log('Operation', operation);
  });
}