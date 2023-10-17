import React, { useEffect, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import CaretIcon from '../../../assets/icons/caret.svg';
import VerticalDots from '../../../assets/icons/vertical-dots.svg';

export interface TreeViewItemProps {
    label: string;
    children?: React.ReactNode;
    initialOpen?: boolean;
    expandedIcon?: string;
    icon?: string;
    level?: number;
    onClick?: React.MouseEventHandler;
    onOptionsClick?: React.MouseEventHandler;
    secondaryIcon?: string;
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
    } = props;

    const [open, setOpen] = useState(initialOpen);

    const toggleOpen = () => {
        setOpen(!open);
    };

    useEffect(() => {
        setOpen(initialOpen);
    }, [initialOpen]);

    const onClickItemHandler: React.MouseEventHandler = e => {
        toggleOpen();
        onClick && onClick(e);
    };

    const onOptionsClickHandler: React.MouseEventHandler = e => {
        e.stopPropagation();
        onOptionsClick && onOptionsClick(e);
    };

    return (
        <div>
            <div
                onClick={onClickItemHandler}
                style={{ paddingLeft: `${level * 10}px` }}
                className="flex flex-row cursor-pointer select-none rounded-lg py-3 group hover:bg-[#F1F5F9]"
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
                    <img
                        src={VerticalDots}
                        onClick={onOptionsClickHandler}
                        className="flex self-end w-6 h-6 mx-3 hidden group-hover:inline-block"
                    />
                )}
                {secondaryIcon && (
                    <img
                        src={secondaryIcon}
                        className="flex self-end w-6 h-6 mx-3 group-hover:hidden"
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
