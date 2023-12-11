import { Icon } from '@/powerhouse';

type DriveNameProps = {
    driveName: string;
};
export function DriveName(props: DriveNameProps) {
    return (
        <div className="flex gap-2 rounded-xl bg-gray-100 p-3 font-semibold text-gray-500">
            <Icon name="drive" className="text-gray-600" />
            {props.driveName}
        </div>
    );
}
