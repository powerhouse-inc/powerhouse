import connectConfig from 'connect-config';
import { atom, useAtom } from 'jotai';

const atomConnectConfig = atom(connectConfig);

export function useConnectConfig() {
    const config = useAtom(atomConnectConfig);
    return config;
}
