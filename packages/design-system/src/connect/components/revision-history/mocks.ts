import { addDays } from "date-fns";
import { Operation, SignatureArray } from "./types";

export const mockSignature: SignatureArray = [
  "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "onCoFcadHQoqpoie/XuS7ItuNOQ=",
  "onCoFcadHQoqpoie/XuS7ItuNOQ=",
  "0x1234",
];

export const mockOperation: Operation = {
  id: "6wYLICDhX5w1Hq7mIo6CRbXUV1I=",
  hash: "onCoFcadHQoqpoie/XuS7ItuNOQ=",
  index: 0,
  input: {
    id: "6wYLICDhX5w1Hq7mIo6CRbXUV1I=",
    name: "Example input",
  },
  skip: 0,
  timestamp: "2024-06-13T14:39:12.936Z",
  type: "EXAMPLE_OPERATION",
  error: undefined,
  context: {
    signer: {
      user: {
        address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        chainId: 1,
      },
      signatures: [mockSignature, mockSignature],
    },
  },
};

export const mockOperations = [
  mockOperation,
  mockOperation,
  {
    ...mockOperation,
    error: "Data mismatch detected",
  },
  { ...mockOperation, skip: 3 },
  mockOperation,
  mockOperation,
  mockOperation,
  { ...mockOperation, context: undefined },
  mockOperation,
  {
    ...mockOperation,
    timestamp: "2024-06-14T14:39:12.936Z",
  },
  { ...mockOperation, timestamp: "2024-06-14T14:39:12.936Z" },
  { ...mockOperation, timestamp: "2024-06-14T14:39:12.936Z", skip: 2 },
  { ...mockOperation, timestamp: "2024-06-14T14:39:12.936Z" },
  { ...mockOperation, timestamp: "2024-06-14T14:39:12.936Z" },
  {
    ...mockOperation,
    timestamp: "2024-06-14T14:39:12.936Z",
  },
  { ...mockOperation, timestamp: "2024-06-15T14:39:12.936Z", skip: 1 },
  {
    ...mockOperation,
    timestamp: "2024-06-15T14:39:12.936Z",
    error: "Data mismatch detected",
  },
  {
    ...mockOperation,
    timestamp: "2024-06-15T14:39:12.936Z",
  },
  { ...mockOperation, timestamp: "2024-06-15T14:39:12.936Z" },
  ...Array.from({ length: 100 }, (_, index) =>
    Array.from({ length: 5 }, () => ({
      ...mockOperation,
      timestamp: addDays(`2024-06-15T14:39:12.936Z`, index).toISOString(),
    })),
  ).flat(),
].map((op, index) => ({
  ...op,
  index,
}));

export const globalOperations = mockOperations;
export const localOperations: Operation[] = mockOperations.map((op) => ({
  ...op,
  scope: "local",
}));
