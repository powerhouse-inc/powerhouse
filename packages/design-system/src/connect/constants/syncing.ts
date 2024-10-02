export const SYNCING = 'SYNCING';
export const SUCCESS = 'SUCCESS';
export const CONFLICT = 'CONFLICT';
export const MISSING = 'MISSING';
export const ERROR = 'ERROR';
export const INITIAL_SYNC = 'INITIAL_SYNC';

export const syncStatuses = [
    INITIAL_SYNC,
    SYNCING,
    SUCCESS,
    CONFLICT,
    MISSING,
    ERROR,
] as const;
