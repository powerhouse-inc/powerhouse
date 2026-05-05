import {
  generateId,
  type Operation,
} from "@powerhousedao/shared/document-model";
import { addHours } from "date-fns";
import { evolve, join, pipe, randomInteger, randomString, times } from "remeda";
import type { SignatureArray } from "./types.js";
export const mockSignature: SignatureArray = [
  "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "onCoFcadHQoqpoie/XuS7ItuNOQ=",
  "onCoFcadHQoqpoie/XuS7ItuNOQ=",
  "0x1234",
];

const mockDocumentSignature: [string, string, string, string, string] = [
  "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "onCoFcadHQoqpoie/XuS7ItuNOQ=",
  "onCoFcadHQoqpoie/XuS7ItuNOQ=",
  "0x1234",
  "extra-signature-field",
];

export const mockOperation: Operation = {
  id: "6wYLICDhX5w1Hq7mIo6CRbXUV1I=",
  hash: "onCoFcadHQoqpoie/XuS7ItuNOQ=",
  index: 0,
  skip: 0,
  timestampUtcMs: "2024-06-13T14:39:12.936Z",
  error: undefined,
  action: {
    id: "411c010c-ecd5-4445-aafd-0b227b7781bd",
    timestampUtcMs: "2024-06-13T14:39:12.936Z",
    type: "EXAMPLE_OPERATION",
    input: {
      id: "6wYLICDhX5w1Hq7mIo6CRbXUV1I=",
      name: "Example input",
    },
    scope: "global",
    context: {
      signer: {
        user: {
          address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
          chainId: 1,
          networkId: "eip155:1",
        },
        app: {
          name: "Connect",
          key: "mock-key",
        },
        signatures: [mockDocumentSignature, mockDocumentSignature],
      },
    },
  },
};

export const mockOperations = makeMockOperations();

export const globalOperations = mockOperations;
export const localOperations: Operation[] = mockOperations.map((op) => ({
  ...op,
  scope: "local",
}));

function makeMockOperations(count = 100) {
  return times(count, (index) =>
    evolve(mockOperation, {
      id: () => generateId(),
      hash: () => `${randomString(27)}=`,
      index: () => index,
      timestampUtcMs: (timestamp) => evolveTimestamp(timestamp),
      error: index % 5 === 0 ? () => "Data mismatch detected" : () => undefined,
      action: {
        id: () => generateId(),
        timestampUtcMs: (timestamp) => evolveTimestamp(timestamp),
        input: () => ({
          id: generateId(),
          content: pipe(
            randomInteger(1, 100),
            times((num) => randomString(num)),
            join(" "),
          ),
        }),
      },
    }),
  );
}

function evolveTimestamp(timestamp: string) {
  return addHours(timestamp, randomInteger(1, 72)).toISOString();
}
