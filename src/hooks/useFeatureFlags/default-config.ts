export const FEATURE_FLAG_KEY_STORAGE = 'feature-flags-config';

const ENABLED_EDITORS = import.meta.env.VITE_ENABLED_EDITORS || undefined;
const enabledEditors = ENABLED_EDITORS?.split(',');

const DISABLED_EDITORS = import.meta.env.VITE_DISABLED_EDITORS || undefined;
const DEFAULT_DRIVE_URL = import.meta.env.VITE_DEFAULT_DRIVE_URL || undefined;
const disabledEditors = DISABLED_EDITORS?.split(',');

const DISABLE_ADD_PUBLIC_DRIVES =
    import.meta.env.VITE_DISABLE_ADD_PUBLIC_DRIVES || undefined;
const DISABLE_ADD_CLOUDDRIVES =
    import.meta.env.VITE_DISABLE_ADD_CLOUD_DRIVES || undefined;
const DISABLE_ADD_LOCAL_DRIVES =
    import.meta.env.VITE_DISABLE_ADD_LOCAL_DRIVES || undefined;
const DISABLE_DELETE_PUBLIC_DRIVES =
    import.meta.env.VITE_DISABLE_DELETE_PUBLIC_DRIVES || undefined;
const DISABLE_DELETE_CLOUD_DRIVES =
    import.meta.env.VITE_DISABLE_DELETE_CLOUD_DRIVES || undefined;
const DISABLE_DELETE_LOCAL_DRIVES =
    import.meta.env.VITE_DISABLE_DELETE_LOCAL_DRIVES || undefined;

export interface FeatureFlag {
    defaultDrive?: {
        url: string;
        loaded: boolean;
    };
    editors: {
        enabledEditors?: '*' | string[];
        disabledEditors?: '*' | string[];
    };
    drives: {
        allowAddPublicDrives: boolean;
        allowAddCloudDrives: boolean;
        allowAddLocalDrives: boolean;
        allowDeletePublicDrives: boolean;
        allowDeleteCloudDrives: boolean;
        allowDeleteLocalDrives: boolean;
    };
}

const defaultConfig: FeatureFlag = {
    drives: {
        allowAddPublicDrives: DISABLE_ADD_PUBLIC_DRIVES !== 'true',
        allowAddCloudDrives: DISABLE_ADD_CLOUDDRIVES !== 'true',
        allowAddLocalDrives: DISABLE_ADD_LOCAL_DRIVES !== 'true',
        allowDeletePublicDrives: DISABLE_DELETE_PUBLIC_DRIVES !== 'true',
        allowDeleteCloudDrives: DISABLE_DELETE_CLOUD_DRIVES !== 'true',
        allowDeleteLocalDrives: DISABLE_DELETE_LOCAL_DRIVES !== 'true',
    },
    defaultDrive: DEFAULT_DRIVE_URL
        ? {
              url: DEFAULT_DRIVE_URL,
              loaded: false,
          }
        : undefined,
    editors: {
        enabledEditors: ENABLED_EDITORS === '*' ? '*' : enabledEditors,
        disabledEditors: DISABLED_EDITORS === '*' ? '*' : disabledEditors,
    },
};

export default defaultConfig;
