import React from 'react';
import { twMerge } from 'tailwind-merge';
import { Icon } from '..';

export interface TreeViewItemProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick'> {
    label: string;
    children?: React.ReactNode;
    open?: boolean;
    icon?: React.JSX.Element;
    expandedIcon?: React.JSX.Element;
    secondaryIcon?: React.JSX.Element;
    level?: number;
    onClick?: (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
    onOptionsClick?: (
        event: React.MouseEvent<HTMLDivElement, MouseEvent>,
    ) => void;
    buttonProps?: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLDivElement>,
        HTMLDivElement
    >;
    optionsContent?: React.ReactNode;
    topIndicator?: React.ReactNode;
    bottomIndicator?: React.ReactNode;
}

const injectLevelProps = (
    children: React.ReactNode,
    level: number,
): React.ReactNode => {
    return React.Children.map(children, child => {
        if (React.isValidElement(child)) {
            if (child.type === React.Fragment) {
                return injectLevelProps(child.props.children, level);
            }

            const customProps: Partial<TreeViewItemProps> = {
                level: level + 1,
            };

            return React.cloneElement(child, {
                ...child.props,
                ...customProps,
            });
        }

        return child;
    });
};

export const TreeViewItem: React.FC<TreeViewItemProps> = props => {
    const {
        open,
        label,
        onClick,
        children,
        icon,
        expandedIcon,
        secondaryIcon,
        onOptionsClick,
        optionsContent,
        topIndicator,
        bottomIndicator,
        level = 0,
        buttonProps = {},
        ...divProps
    } = props;

    const {
        className: containerButtonClassName,
        style: containerButtonStyle,
        ...containerButtonProps
    } = buttonProps;

    const levelPadding = level * 10;
    const caretPadding = children ? 0 : 24;

    return (
        <div {...divProps}>
            <div
                role="button"
                onClick={onClick}
                style={containerButtonStyle}
                className={twMerge(
                    'flex flex-col w-full cursor-pointer select-none group/tree-item focus:outline-none relative max-h-[49px]',
                    containerButtonClassName,
                )}
                {...containerButtonProps}
            >
                {topIndicator && (
                    <div className="absolute top-0 w-full">{topIndicator}</div>
                )}
                <div
                    className="flex flex-row w-full cursor-pointer"
                    style={{ paddingLeft: `${levelPadding + caretPadding}px` }}
                >
                    {children && (
                        <Icon
                            name="caret"
                            className={twMerge(
                                open && 'rotate-90',
                                'transition ease delay-50 pointer-events-none',
                            )}
                        />
                    )}
                    {icon && (
                        <span className="pointer-events-none">
                            {open ? expandedIcon || icon : icon}
                        </span>
                    )}
                    {label && (
                        <div className="ml-2 flex flex-1 overflow-hidden whitespace-nowrap relative">
                            <span className="absolute right-0 w-12 h-full bg-gradient-to-r from-transparent to-inherit" />
                            {label}
                        </div>
                    )}
                    {optionsContent && (
                        <div className="w-6 h-6 px-3 box-content hidden group-hover/tree-item:inline-block">
                            {optionsContent}
                        </div>
                    )}
                    {secondaryIcon && (
                        <span className="flex self-end mx-3 group-hover/tree-item:hidden pointer-events-none">
                            {secondaryIcon}
                        </span>
                    )}
                </div>
                {bottomIndicator && (
                    <div className="absolute bottom-0 w-full">
                        {bottomIndicator}
                    </div>
                )}
            </div>
            {children && (
                <div className={twMerge(!open && 'hidden')}>
                    {injectLevelProps(children, level)}
                </div>
            )}
        </div>
    );
};
