import { IconProps as DefaultIconProps, Icon } from '@/powerhouse';

export type StatusIconProps = Omit<DefaultIconProps, 'name'>;
export const AvailableIcon = (props: StatusIconProps) => (
    <Icon {...props} className="text-green-900" size={12} name="available" />
);
export const SyncingIcon = (props: StatusIconProps) => (
    <Icon {...props} className="text-blue-900" size={12} name="syncing" />
);
export const SyncedIcon = (props: StatusIconProps) => (
    <Icon {...props} className="text-green-900" size={12} name="synced" />
);
export const ErrorIcon = (props: StatusIconProps) => (
    <Icon {...props} className="text-red-900" size={12} name="error" />
);
