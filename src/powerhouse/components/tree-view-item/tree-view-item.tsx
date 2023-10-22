import CaretIcon from '@/assets/icons/caret.svg';
import VerticalDots from '@/assets/icons/vertical-dots.svg';
import React, { useEffect, useState } from 'react';
import { twMerge } from 'tailwind-merge';

export interface TreeViewItemProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick'> {
    label: string;
    children?: React.ReactNode;
    initialOpen?: boolean;
    expandedIcon?: string;
    icon?: string;
    level?: number;
    onClick?: (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
    onOptionsClick?: (
        event: React.MouseEvent<HTMLDivElement, MouseEvent>,
    ) => void;
    secondaryIcon?: string;
    buttonProps?: React.HTMLAttributes<HTMLDivElement>;
    optionsButtonProps?: React.HTMLAttributes<HTMLDivElement>;
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
        icon,
        label,
        onClick,
        children,
        initialOpen,
        expandedIcon,
        secondaryIcon,
        onOptionsClick,
        level = 0,
        buttonProps = {},
        optionsButtonProps = {},
        ...divProps
    } = props;

    const [open, setOpen] = useState(initialOpen);

    const toggleOpen = () => {
        setOpen(!open);
    };

    useEffect(() => {
        setOpen(initialOpen);
    }, [initialOpen]);

    const onClickItemHandler = (
        e: React.MouseEvent<HTMLDivElement, MouseEvent>,
    ) => {
        toggleOpen();
        onClick && onClick(e);
    };

    const onOptionsClickHandler = (
        e: React.MouseEvent<HTMLDivElement, MouseEvent>,
    ) => {
        e.stopPropagation();
        onOptionsClick && onOptionsClick(e);
    };

    const {
        className: containerButtonClassName,
        style: containerButtonStyle,
        ...containerButtonProps
    } = buttonProps;

    const {
        className: optionsButtonClassName,
        ...containerOptionsButtonProps
    } = optionsButtonProps;

    return (
        <div {...divProps}>
            <div
                role="button"
                onClick={onClickItemHandler}
                style={{
                    paddingLeft: `${level * 10}px`,

                    ...containerButtonStyle,
                }}
                className={twMerge(
                    'flex flex-row w-full cursor-pointer select-none group focus:outline-none',
                    containerButtonClassName,
                )}
                {...containerButtonProps}
            >
                <img
                    src={CaretIcon}
                    className={twMerge(
                        open && 'rotate-90',
                        'transition ease delay-50 pointer-events-none',
                    )}
                />
                {icon && (
                    <img
                        src={open ? expandedIcon || icon : icon}
                        className="pointer-events-none"
                    />
                )}
                {label && <div className="ml-2 flex flex-1">{label}</div>}
                {onOptionsClick && (
                    <div
                        role="button"
                        onClick={onOptionsClickHandler}
                        className={twMerge(
                            'w-6 h-6 mx-3 hidden group-hover:inline-block focus:outline-none',
                            optionsButtonClassName,
                        )}
                        {...containerOptionsButtonProps}
                    >
                        <img
                            src={VerticalDots}
                            className="w-6 h-6 pointer-events-none"
                        />
                    </div>
                )}
                {secondaryIcon && (
                    <img
                        src={secondaryIcon}
                        className="flex self-end w-6 h-6 mx-3 group-hover:hidden pointer-events-none"
                    />
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
