import { Button } from 'react-aria-components';
import { twMerge } from 'tailwind-merge';
import IconGear from '../assets/icons/gear.svg?react';

export type DriveType = 'public' | 'local' | 'cloud';

export interface DriveViewProps extends React.HTMLAttributes<HTMLDivElement> {
    type: DriveType;
    name: string;
}

export const DriveView: React.FC<DriveViewProps> = ({
    className,
    type,
    name,
    ...props
}) => {
    return (
        <div
            className={twMerge(
                'pb-2',
                type === 'public' && 'bg-bg rounded-lg',
                className,
            )}
            {...props}
        >
            <div className="border-y border-bg px-4 py-3 flex items-center justify-between">
                <p className="text-[#9EA0A1] font-medium text-sm leading-6">
                    {name}
                </p>
                <Button>
                    <IconGear />
                </Button>
            </div>
        </div>
    );
};
