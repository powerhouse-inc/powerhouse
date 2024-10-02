export const SWITCHBOARD = 'SWITCHBOARD';
export const LOCAL = 'LOCAL';
export const CLOUD = 'CLOUD';
export const PUBLIC = 'PUBLIC';

export const sharingTypes = [LOCAL, CLOUD, PUBLIC] as const;

export const driveLocations = [LOCAL, CLOUD, SWITCHBOARD] as const;
