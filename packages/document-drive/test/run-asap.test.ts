import { describe, expect, it } from 'vitest';
import { RunAsap, runAsapAsync } from '../src';

describe('Run ASAP', () => {
    it('should run setTimeout', async () => {
        const result = await runAsapAsync(
            () => Promise.resolve(1),
            RunAsap.useSetTimeout
        );
        expect(result).toBe(1);
    });
});
