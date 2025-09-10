import type { Operation } from "document-model";
import type { Day, Revision, Signature, Skip } from "./types.js";

export function makeRows(operations: Operation[]) {
  const revisionsAndSkips: (Revision | Skip | Day)[] = [];
  const seenDays = new Set<string>();

  for (const operation of operations) {
    const day = operation.timestampUtcMs.split("T")[0];

    if (!seenDays.has(day)) {
      seenDays.add(day);
      revisionsAndSkips.push({
        type: "day",
        height: 32,
        timestampUtcMs: day,
      });
    }

    revisionsAndSkips.push({
      type: "revision",
      height: 46,
      operationIndex: operation.index,
      eventId: operation.id ?? "EVENT_ID_NOT_FOUND",
      stateHash: operation.hash,
      operationType: operation.action.type,
      operationInput: operation.action.input ?? {},
      address: operation.action?.context?.signer?.user.address as
        | `0x${string}`
        | undefined,
      chainId: operation.action?.context?.signer?.user.chainId,
      timestampUtcMs: operation.timestampUtcMs,
      signatures: makeSignatures(
        (operation.action?.context?.signer?.signatures as
          | string[][]
          | undefined) ?? [],
      ),
      errors: operation.error ? [operation.error] : undefined,
    });

    if (operation.skip > 0) {
      revisionsAndSkips.push({
        type: "skip",
        height: 34,
        operationIndex: operation.index,
        skipCount: operation.skip,
        timestampUtcMs: operation.timestampUtcMs,
      });
    }
  }

  return revisionsAndSkips;
}

export function getUniqueDatesInOrder(operations: Operation[]) {
  const dates = new Set<string>();

  for (const operation of operations) {
    const date = operation.timestampUtcMs.split("T")[0];
    dates.add(date);
  }

  return Array.from(dates).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime(),
  );
}

function makeSignatureFromSignatureArray(signatureArray: string[]): Signature {
  const [signerAddress, hash, prevStateHash, signatureBytes] = signatureArray;

  return {
    signerAddress,
    hash,
    prevStateHash,
    signatureBytes,
    isVerified: true,
  };
}

function makeSignatures(signaturesArray: string[][] | undefined) {
  return signaturesArray?.map(makeSignatureFromSignatureArray);
}
