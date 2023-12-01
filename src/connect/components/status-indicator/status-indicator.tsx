import { SyncStatus } from '@/connect';
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
    type: 'LOCAL_DRIVE';
};

type SharedPublicOrCloudProps = SharedProps & {
    type: 'PUBLIC_DRIVE' | 'CLOUD_DRIVE';
    isConnected: boolean;
};

type CloudOnlyProps = SharedPublicOrCloudProps & {
    availability: 'cloud-only';
};

type AvailableOfflineProps = SharedPublicOrCloudProps & {
    availability: 'AVAILABLE_OFFLINE';
    syncStatus: SyncStatus;
};

export type PublicOrCloudDriveProps = CloudOnlyProps | AvailableOfflineProps;

export type StatusIndicatorProps = LocalProps | PublicOrCloudDriveProps;
export function StatusIndicator(props: StatusIndicatorProps) {
    if (props.error) {
        return <ErrorIcon {...props.iconProps} />;
    }
    if (props.type === 'LOCAL_DRIVE') {
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
        if (props.syncStatus === 'SYNCING') {
            return <SyncingIcon {...props.iconProps} />;
        }
        if (props.syncStatus === 'SYNCED') {
            return <SyncedIcon {...props.iconProps} />;
        }
    }

    if (props.syncStatus === 'NOT_SYNCED_YET') {
        return <SyncedIcon {...props.iconProps} />;
    }

    return <ErrorIcon {...props.iconProps} />;
}
