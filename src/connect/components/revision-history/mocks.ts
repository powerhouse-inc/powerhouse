import { Operation } from './types';

export const mockSignature = {
    hash: 'onCoFcadHQoqpoie/XuS7ItuNOQ=',
    signatureBytes: '0x1234',
    signerAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    timestamp: 1719232415114,
    isVerified: true,
};

export const mockOperation: Operation = {
    id: '6wYLICDhX5w1Hq7mIo6CRbXUV1I=',
    hash: 'onCoFcadHQoqpoie/XuS7ItuNOQ=',
    index: 0,
    input: {
        id: '6wYLICDhX5w1Hq7mIo6CRbXUV1I=',
        name: 'Example input',
    },
    scope: 'global',
    skip: 0,
    timestamp: '2024-06-13T14:39:12.936Z',
    type: 'EXAMPLE_OPERATION',
    error: undefined,
    signatures: [mockSignature],
    context: {
        user: {
            address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
            chainId: 1,
        },
    },
};

export const mockOperations = [
    mockOperation,
    mockOperation,
    {
        ...mockOperation,
        error: 'Data mismatch detected',
        signatures: [{ ...mockSignature, isVerified: false }],
    },
    { ...mockOperation, skip: 3 },
    mockOperation,
    mockOperation,
    mockOperation,
    {
        ...mockOperation,
        timestamp: '2024-06-14T14:39:12.936Z',
        signatures: [
            { ...mockSignature, isVerified: false },
            { ...mockSignature, isVerified: false },
        ],
    },
    { ...mockOperation, timestamp: '2024-06-14T14:39:12.936Z' },
    { ...mockOperation, timestamp: '2024-06-14T14:39:12.936Z', skip: 2 },
    { ...mockOperation, timestamp: '2024-06-14T14:39:12.936Z' },
    { ...mockOperation, timestamp: '2024-06-14T14:39:12.936Z' },
    { ...mockOperation, timestamp: '2024-06-14T14:39:12.936Z' },
    { ...mockOperation, timestamp: '2024-06-15T14:39:12.936Z', skip: 1 },
    {
        ...mockOperation,
        timestamp: '2024-06-15T14:39:12.936Z',
        error: 'Data mismatch detected',
        signatures: [
            { ...mockSignature, isVerified: false },
            { ...mockSignature, isVerified: false },
        ],
    },
    {
        ...mockOperation,
        timestamp: '2024-06-15T14:39:12.936Z',
        signatures: [{ ...mockSignature, isVerified: false }, mockSignature],
    },
    { ...mockOperation, timestamp: '2024-06-15T14:39:12.936Z' },
].map((op, index) => ({
    ...op,
    index,
}));

export const globalOperations = mockOperations;

export const localOperations: Operation[] = mockOperations.map(op => ({
    ...op,
    scope: 'local',
}));
