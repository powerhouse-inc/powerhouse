import { ReactComponent as IconCross } from '@/assets/icons/cross.svg';
import { Node } from '@react-types/shared';
import { ButtonHTMLAttributes, DetailedHTMLProps, forwardRef } from 'react';
import { useTheme } from 'src/store';
import { Tab } from 'src/store/tabs';

type IProps = DetailedHTMLProps<
    ButtonHTMLAttributes<HTMLButtonElement>,
    HTMLButtonElement
> & {
    as: React.ElementType;
    item: Node<Tab> | string;
    onCloseTab?: (tab: Tab) => void;
};

export default forwardRef((props: IProps, ref) => {
    const theme = useTheme();

    const {
        as = 'button',
        className,
        item,
        onCloseTab,
        ...buttonProps
    } = props;
    const As = as;
    return (
        <As
            className={`border-accent-3 text-accent-5 hover:bg-accent-2 aria-selected:bg-accent-3 mr-3
            flex min-w-fit max-w-[144px] cursor-pointer
            items-center justify-between truncate rounded-md border px-4
            py-[6px] outline-none last-of-type:mr-0 aria-selected:border-transparent${
                theme === 'dark'
                    ? 'shadow-button'
                    : 'hover:shadow-button aria-selected:shadow-button'
            }
            ${className}
            `}
            ref={ref}
            {...buttonProps}
        >
            <span>{typeof item === 'string' ? item : item.rendered}</span>
            <div
                className="hover:bg-light ml-3 mt-[1px] flex h-[21px] w-[21px] items-center justify-center rounded-full hover:text-slate-800"
                onClick={() =>
                    typeof item !== 'string' &&
                    item.value &&
                    onCloseTab?.(item.value)
                }
            >
                <IconCross className="rotate-45" fill="currentcolor" />
            </div>
        </As>
    );
});
