import { Tooltip } from '@/connect';
import { Icon } from '@/powerhouse';
import { useId } from 'react';
import { twMerge } from 'tailwind-merge';

export type ErrorsProps = {
    errors: string[] | undefined;
};

export function Errors(props: ErrorsProps) {
    const { errors } = props;
    const tooltipId = useId().replace(/:/g, '');

    const hasErrors = !!errors?.length;

    const color = hasErrors ? 'text-red-800' : 'text-green-700';

    const icon = hasErrors ? (
        <Icon name="exclamation" size={16} />
    ) : (
        <Icon name="check" size={16} />
    );

    const text = hasErrors ? `Error: ${errors[0]}` : 'No errors';

    const fullErrorsText = errors?.map((message, index) => (
        <p key={index} className="text-red-800">
            Error: {message}
        </p>
    ));

    return (
        <span
            className={twMerge(
                'flex w-fit items-center rounded-lg border border-gray-200 px-2 py-1 text-xs',
                color,
            )}
        >
            {icon}
            <a
                id={tooltipId}
                className={twMerge(
                    'inline-block max-w-36 truncate',
                    hasErrors && 'cursor-pointer',
                )}
            >
                {text}
            </a>
            {hasErrors && (
                <Tooltip anchorSelect={`#${tooltipId}`}>
                    {fullErrorsText}
                </Tooltip>
            )}
        </span>
    );
}
