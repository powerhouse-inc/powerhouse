import React, { useEffect, useState } from 'react';
import { Button, ButtonProps, PressEvent } from 'react-aria-components';
import { twMerge } from 'tailwind-merge';
import CaretIcon from '../../../assets/icons/caret.svg';
import VerticalDots from '../../../assets/icons/vertical-dots.svg';

export interface TreeViewItemProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick'> {
    label: string;
    children?: React.ReactNode;
    initialOpen?: boolean;
    expandedIcon?: string;
    icon?: string;
    level?: number;
    onClick?: (event: PressEvent) => void;
    onOptionsClick?: (event: PressEvent) => void;
    secondaryIcon?: string;
    buttonProps?: ButtonProps;
    optionsButtonProps?: ButtonProps;
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

            const customProps: Partial<TreeViewItemProps> = {};

            if (child.type === TreeViewItem) {
                customProps.level = level + 1;
            }

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

    const onClickItemHandler = (e: PressEvent) => {
        toggleOpen();
        onClick && onClick(e);
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
            <Button
                onPress={onClickItemHandler}
                style={{
                    paddingLeft: `${level * 10}px`,
                    ...containerButtonStyle,
                }}
                className={twMerge(
                    'flex flex-row w-full cursor-pointer select-none rounded-lg py-3 group focus:outline-none hover:bg-[#F1F5F9]',
                    typeof containerButtonClassName === 'string' &&
                        containerButtonClassName,
                )}
                {...containerButtonProps}
            >
                <img
                    src={CaretIcon}
                    className={twMerge(
                        open && 'rotate-90',
                        'transition ease delay-50',
                    )}
                />
                {icon && <img src={open ? expandedIcon || icon : icon} />}
                {label && <div className="ml-1 flex flex-1">{label}</div>}
                {onOptionsClick && (
                    <Button
                        onPress={onOptionsClick}
                        className={twMerge(
                            'w-6 h-6 mx-3 hidden group-hover:inline-block focus:outline-none',
                            typeof optionsButtonClassName === 'string' &&
                                optionsButtonClassName,
                        )}
                        {...containerOptionsButtonProps}
                    >
                        <img src={VerticalDots} className="w-6 h-6" />
                    </Button>
                )}
                {secondaryIcon && (
                    <img
                        src={secondaryIcon}
                        className="flex self-end w-6 h-6 mx-3 group-hover:hidden"
                    />
                )}
            </Button>
            {children && (
                <div className={twMerge(!open && 'hidden')}>
                    {injectLevelProps(children, level)}
                </div>
            )}
        </div>
    );
};
