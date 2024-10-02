import { PropsWithChildren } from 'react';

interface ToolbarButtonProps {
    readonly onClick?: () => void;
}

export function ToolbarButton(props: PropsWithChildren<ToolbarButtonProps>) {
    const handleClick =
        props.onClick ||
        (() => {
            console.log('No onClick handler attached to button.');
        });

    return (
        <div
            className="toolbar-button"
            onClick={handleClick}
            style={{ userSelect: 'none' }}
        >
            {props.children}
        </div>
    );
}
