import {
    CONFLICT,
    ERROR,
    MISSING,
    SUCCESS,
    SYNCING,
    SyncStatus,
} from '@/connect';
import { Icon } from '@/powerhouse';
import { ComponentPropsWithoutRef } from 'react';
import { twMerge } from 'tailwind-merge';

export type SyncStatusIconProps = Omit<
    ComponentPropsWithoutRef<typeof Icon>,
    'name'
> & {
    syncStatus: SyncStatus;
};
export function SyncStatusIcon(props: SyncStatusIconProps) {
    const { syncStatus, className, ...iconProps } = props;
    const syncStatusIcons = {
        [SYNCING]: (
            <Icon
                size={16}
                {...iconProps}
                className={twMerge('text-blue-900', className)}
                name="syncing"
            />
        ),
        [SUCCESS]: (
            <Icon
                size={16}
                {...iconProps}
                className={twMerge('text-green-900', className)}
                name="synced"
            />
        ),
        [CONFLICT]: (
            <Icon
                size={16}
                {...iconProps}
                className={twMerge('text-orange-900', className)}
                name="error"
            />
        ),
        [MISSING]: (
            <Icon
                size={16}
                {...iconProps}
                className={twMerge('text-red-900', className)}
                name="circle"
            />
        ),
        [ERROR]: (
            <Icon
                size={16}
                {...iconProps}
                className={twMerge('text-red-900', className)}
                name="error"
            />
        ),
    } as const;

    return syncStatusIcons[syncStatus];
}
