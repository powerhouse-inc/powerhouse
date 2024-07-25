export const SYNCING = 'SYNCING';
export const SUCCESS = 'SUCCESS';
export const CONFLICT = 'CONFLICT';
export const MISSING = 'MISSING';
export const ERROR = 'ERROR';

export const syncStatuses = [
    SYNCING,
    SUCCESS,
    CONFLICT,
    MISSING,
    ERROR,
] as const;
