import { PropsWithChildren } from 'react';

interface ToolbarButtonProps {
    onClick?: () => void;
}

export function ToolbarButton(props: PropsWithChildren<ToolbarButtonProps>) {
    const handleClick =
        props.onClick ||
        (() => {
            console.log('No onClick handler attached to button.');
        });

    return (
        <div
            onClick={handleClick}
            className="toolbar-button"
            style={{ userSelect: 'none' }}
        >
            {props.children}
        </div>
    );
}
