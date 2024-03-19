import { Renown } from '.';
import { BrowserStorage } from '../storage/browser';

export function initRenownBrowser(connectId: string) {
    return new Renown(new BrowserStorage('renown'), connectId);
}
