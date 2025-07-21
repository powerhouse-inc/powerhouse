import { createReactor, useCreateFirstLocalDrive } from '#store';
import {
    useInitializeProcessorManager,
    useInitializeReactor,
} from '@powerhousedao/state';

export function useLoadData() {
    useInitializeReactor(createReactor);
    useInitializeProcessorManager();
    useCreateFirstLocalDrive();
}
