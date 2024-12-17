import { Renown } from '.';
import { ElectronStorage } from '../storage/electron';

export function initRenownElectron(connectId: string) {
    return new Renown(new ElectronStorage('renown'), connectId);
}
