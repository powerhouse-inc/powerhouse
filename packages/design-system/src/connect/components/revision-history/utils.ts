import {
  Day,
  Operation,
  Revision,
  Signature,
  SignatureArray,
  Skip,
} from "./types";

export function makeRows(operations: Operation[]) {
  const revisionsAndSkips: (Revision | Skip | Day)[] = [];
  const seenDays = new Set<string>();

  for (const operation of operations) {
    const day = operation.timestamp.split("T")[0];

    if (!seenDays.has(day)) {
      seenDays.add(day);
      revisionsAndSkips.push({
        type: "day",
        height: 32,
        timestamp: day,
      });
    }

    revisionsAndSkips.push({
      type: "revision",
      height: 46,
      operationIndex: operation.index,
      eventId: operation.id ?? "EVENT_ID_NOT_FOUND",
      stateHash: operation.hash,
      operationType: operation.type,
      operationInput: operation.input ?? {},
      address: operation.context?.signer?.user?.address,
      chainId: operation.context?.signer?.user?.chainId,
      timestamp: operation.timestamp,
      signatures: makeSignatures(operation.context?.signer?.signatures),
      errors: operation.error ? [operation.error] : undefined,
    });

    if (operation.skip > 0) {
      revisionsAndSkips.push({
        type: "skip",
        height: 34,
        operationIndex: operation.index,
        skipCount: operation.skip,
        timestamp: operation.timestamp,
      });
    }
  }

  return revisionsAndSkips;
}

export function getUniqueDatesInOrder(operations: Operation[]) {
  const dates = new Set<string>();

  for (const operation of operations) {
    const date = operation.timestamp.split("T")[0];
    dates.add(date);
  }

  return Array.from(dates).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime(),
  );
}

function makeSignatureFromSignatureArray(
  signatureArray: SignatureArray,
): Signature {
  const [signerAddress, hash, prevStateHash, signatureBytes] = signatureArray;

  return {
    signerAddress,
    hash,
    prevStateHash,
    signatureBytes,
    isVerified: true,
  };
}

function makeSignatures(signaturesArray: SignatureArray[] | undefined) {
  return signaturesArray?.map(makeSignatureFromSignatureArray);
}
