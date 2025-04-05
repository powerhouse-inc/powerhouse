import { Renown } from './index.js';
import { ElectronStorage } from '../storage/electron.js';

export function initRenownElectron(connectId: string) {
    return new Renown(new ElectronStorage('renown'), connectId);
}
