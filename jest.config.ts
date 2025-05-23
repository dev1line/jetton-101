import type { Config } from 'jest';

const config: Config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
    // maxWorkers: 1,
    maxWorkers: '50%',
    workerThreads: true,
};

export default config;
