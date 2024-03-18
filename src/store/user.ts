import { atom } from 'jotai';
import type { User } from 'src/services/renown/types';

export const userAtom = atom<User | undefined>(undefined);
