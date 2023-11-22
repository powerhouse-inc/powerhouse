import React from 'react';
import { twMerge } from 'tailwind-merge';
import { Icon } from '..';

export type TreeViewItemProps = Omit<
    React.HTMLAttributes<HTMLDivElement>,
    'onClick'
> & {
    label: string;
    children?: React.ReactNode;
    open?: boolean;
    icon?: React.JSX.Element;
    expandedIcon?: React.JSX.Element;
    secondaryIcon?: React.ReactNode;
    level?: number;
    onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
    onOptionsClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
    itemContainerProps?: ItemContainerProps;
    optionsContent?: React.ReactNode;
    topIndicator?: React.ReactNode;
    bottomIndicator?: React.ReactNode;
};

export type ItemContainerProps = React.ComponentProps<'div'>;

export const TreeViewItem: React.FC<TreeViewItemProps> = props => {
    const {
        open,
        label,
        onClick,
        children,
        icon,
        expandedIcon,
        topIndicator,
        bottomIndicator,
        level = 0,
        itemContainerProps = {},
        ...divProps
    } = props;

    const {
        className: containerClassName,
        style: containerStyle,
        ...containerProps
    } = itemContainerProps;

    const levelPadding = level * 10;

    return (
        <div {...divProps}>
            <div
                role="button"
                onClick={onClick}
                style={containerStyle}
                className={twMerge(
                    'flex w-full cursor-pointer select-none flex-col bg-transparent focus:outline-none',
                    containerClassName,
                )}
                {...containerProps}
            >
                {topIndicator && (
                    <div className="absolute top-0 w-full">{topIndicator}</div>
                )}
                <div
                    className="flex w-full cursor-pointer"
                    style={{ paddingLeft: `${levelPadding}px` }}
                >
                    <Icon
                        name="caret"
                        className={twMerge(
                            open && 'rotate-90',
                            'ease delay-50 pointer-events-none transition',
                        )}
                    />
                    {icon && (
                        <span className="pointer-events-none">
                            {open ? expandedIcon || icon : icon}
                        </span>
                    )}
                    {label && (
                        <div className="relative ml-2 overflow-hidden whitespace-nowrap">
                            <span className="absolute right-0 h-full w-12 bg-gradient-to-r from-transparent to-inherit" />
                            {label}
                        </div>
                    )}
                </div>
                {bottomIndicator && (
                    <div className="absolute bottom-0 w-full">
                        {bottomIndicator}
                    </div>
                )}
            </div>
            {children && (
                <div className={twMerge(!open && 'hidden')}>{children}</div>
            )}
        </div>
    );
};
