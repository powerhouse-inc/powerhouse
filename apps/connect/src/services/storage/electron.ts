import store from 'src/app/store';
import { BaseStorage, IStorage } from '.';

export class ElectronStorage<
    T extends Record<string, unknown> = Record<string, unknown>,
> extends BaseStorage<T> {
    constructor(namespace: string) {
        super(store as IStorage<T>, namespace);
    }
}
