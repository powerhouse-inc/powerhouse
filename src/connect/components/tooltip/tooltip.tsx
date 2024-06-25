import { ComponentPropsWithoutRef } from 'react';
import { Tooltip as ReactTooltip } from 'react-tooltip';

type Props = ComponentPropsWithoutRef<typeof ReactTooltip>;

export function Tooltip(props: Props) {
    return (
        <ReactTooltip
            clickable
            noArrow
            border="1px solid var(--gray-200)"
            opacity={1}
            {...props}
            style={{
                backgroundColor: 'var(--white)',
                color: 'var(--gray-900)',
                padding: '8px',
                borderRadius: '8px',
                boxShadow: 'var(--shadow-tooltip)',
                ...props.style,
            }}
        />
    );
}
