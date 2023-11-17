import {
    AvailableIcon,
    ErrorIcon,
    StatusIconProps,
    SyncedIcon,
    SyncingIcon,
} from './status-icons';

type SharedProps = {
    error?: Error;
    iconProps?: StatusIconProps;
};

export type LocalProps = SharedProps & {
    type: 'local-drive';
};

type SharedPublicOrCloudProps = SharedProps & {
    type: 'public-drive' | 'cloud-drive';
    isConnected: boolean;
};

type CloudOnlyProps = SharedPublicOrCloudProps & {
    availability: 'cloud-only';
};

type AvailableOfflineProps = SharedPublicOrCloudProps & {
    availability: 'available-offline';
    syncStatus: 'not-synced-yet' | 'syncing' | 'synced';
};

export type PublicOrCloudDriveProps = CloudOnlyProps | AvailableOfflineProps;

export type StatusIndicatorProps = LocalProps | PublicOrCloudDriveProps;
export function StatusIndicator(props: StatusIndicatorProps) {
    if (props.error) {
        return <ErrorIcon {...props.iconProps} />;
    }
    if (props.type === 'local-drive') {
        return <SyncedIcon {...props.iconProps} />;
    }

    return <PublicOrCloudDriveStatusIndicator {...props} />;
}

export function PublicOrCloudDriveStatusIndicator(
    props: PublicOrCloudDriveProps,
) {
    if (props.availability === 'cloud-only') {
        if (props.isConnected) {
            return <AvailableIcon {...props.iconProps} />;
        }
        return <ErrorIcon {...props.iconProps} />;
    }

    if (props.isConnected) {
        if (props.syncStatus === 'syncing') {
            return <SyncingIcon {...props.iconProps} />;
        }
        if (props.syncStatus === 'synced') {
            return <SyncedIcon {...props.iconProps} />;
        }
    }

    if (props.syncStatus === 'not-synced-yet') {
        return <SyncedIcon {...props.iconProps} />;
    }

    return <ErrorIcon {...props.iconProps} />;
}
