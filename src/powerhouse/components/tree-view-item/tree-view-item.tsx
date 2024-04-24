import { DivProps } from '@/powerhouse';
import { twMerge } from 'tailwind-merge';
import { Icon, TreeViewInput, TreeViewInputProps } from '..';

export type TreeViewItemProps = DivProps &
    Partial<TreeViewInputProps> & {
        label: string;
        mode?: 'read' | 'write';
        children?: React.ReactNode;
        open?: boolean;
        onOptionsClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
        icon?: React.JSX.Element;
        expandedIcon?: React.JSX.Element;
        secondaryIcon?: React.ReactNode;
        level?: number;
        itemContainerProps?: DivProps;
        topIndicator?: React.ReactNode;
        bottomIndicator?: React.ReactNode;
    };

export const TreeViewItem: React.FC<TreeViewItemProps> = props => {
    const {
        open,
        label,
        mode = 'read',
        onClick,
        onSubmitInput,
        onCancelInput,
        children,
        icon,
        expandedIcon,
        submitIcon,
        cancelIcon,
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

    const inputProps = {
        defaultValue: label,
        onSubmitInput,
        onCancelInput,
        submitIcon,
        cancelIcon,
    };

    const content = mode === 'read' ? label : <TreeViewInput {...inputProps} />;

    return (
        <div {...divProps}>
            <div
                role="button"
                onClick={onClick}
                style={containerStyle}
                className={twMerge(
                    'cursor-pointer select-none bg-transparent pl-1 focus:outline-none',
                    containerClassName,
                )}
                {...containerProps}
            >
                {topIndicator && (
                    <div className="absolute top-0 w-full">{topIndicator}</div>
                )}
                <div
                    className="flex w-full cursor-pointer items-center"
                    style={{ paddingLeft: `${levelPadding}px` }}
                >
                    {mode === 'read' ? (
                        <Icon
                            name="caret"
                            className={twMerge(
                                open && 'rotate-90',
                                'ease pointer-events-none transition delay-75',
                            )}
                        />
                    ) : (
                        <span className="inline-block size-6" />
                    )}
                    {icon && (
                        <span className="pointer-events-none mr-2">
                            {open ? expandedIcon || icon : icon}
                        </span>
                    )}
                    <div className="relative w-full overflow-hidden whitespace-nowrap">
                        <span className="absolute right-0 h-full w-12 bg-gradient-to-r from-transparent to-inherit" />
                        {content}
                    </div>
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
