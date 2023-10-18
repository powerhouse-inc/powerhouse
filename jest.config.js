export default {
    preset: 'ts-jest',
    testEnvironment: 'jsdom',
    setupFilesAfterEnv: ['<rootDir>/src/powerhouse/tests/setupTests.ts'],
    moduleNameMapper: {
        '^.+\\.(css|less|scss|sass)$':
            '<rootDir>/src/powerhouse/tests/mocks/styleMock.ts',
        '^.+\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
            '<rootDir>/src/powerhouse/tests/mocks/fileMock.ts',
    },
};
