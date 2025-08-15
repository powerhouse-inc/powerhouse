import { type RenownEventEmitter, type RenownStorage } from '@renown/sdk';
import { Renown } from '@renown/sdk/dist/src/common.js';
import { DEFAULT_RENOWN_URL } from '@renown/sdk/dist/src/constants.js';
import EventEmitter from 'events';
import { ElectronStorage } from '../storage/electron.js';

export function initRenownElectron(connectId: string) {
    console.warn('Renown is not supported in electron');
    return new Renown(
        new ElectronStorage('renown') as unknown as RenownStorage,
        new EventEmitter() as unknown as RenownEventEmitter,
        connectId,
        DEFAULT_RENOWN_URL,
    );
}
