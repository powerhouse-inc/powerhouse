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
    const syncStatusIcons = {
        [SYNCING]: (
            <Icon
                size={12}
                {...props}
                className={twMerge('text-blue-900', props.className)}
                name="syncing"
            />
        ),
        [SUCCESS]: (
            <Icon
                size={12}
                {...props}
                className={twMerge('text-green-900', props.className)}
                name="synced"
            />
        ),
        [CONFLICT]: (
            <Icon
                size={12}
                {...props}
                className={twMerge('text-orange-900', props.className)}
                name="error"
            />
        ),
        [MISSING]: (
            <Icon
                size={12}
                {...props}
                className={twMerge('text-red-900', props.className)}
                name="circle"
            />
        ),
        [ERROR]: (
            <Icon
                size={12}
                {...props}
                className={twMerge('text-red-900', props.className)}
                name="error"
            />
        ),
    } as const;

    return syncStatusIcons[props.syncStatus];
}
