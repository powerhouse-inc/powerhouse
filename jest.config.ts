import { JestConfigWithTsJest } from 'ts-jest';

export default {
    preset: 'ts-jest',
    testEnvironment: 'node',
    collectCoverage: true,
    collectCoverageFrom: [
        'document-models/src/*.ts',
        'document-models/gen/*.ts',
    ],
} satisfies JestConfigWithTsJest;
