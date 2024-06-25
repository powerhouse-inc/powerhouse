import { Tooltip } from '@/connect';
import { Icon } from '@/powerhouse';
import { useId } from 'react';

export type OperationProps = {
    operationType: string;
    operationInput: Record<string, any>;
};

export function Operation(props: OperationProps) {
    const { operationType, operationInput } = props;
    const tooltipId = useId().replace(/:/g, '');

    return (
        <span className="flex items-center gap-2 text-xs">
            {operationType}
            <a id={tooltipId} className="cursor-pointer text-gray-300">
                <Icon name="braces" size={16} />
            </a>
            <Tooltip anchorSelect={`#${tooltipId}`}>
                <code>
                    <pre>{JSON.stringify(operationInput, null, 2)}</pre>
                </code>
            </Tooltip>
        </span>
    );
}
