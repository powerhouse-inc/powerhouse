import { Renown } from './index.js';
import { BrowserStorage } from '../storage/browser.js';

export function initRenownBrowser(connectId: string) {
    return new Renown(new BrowserStorage('renown'), connectId);
}
