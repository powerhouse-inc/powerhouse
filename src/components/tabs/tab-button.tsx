import IconCross from '@/assets/icons/cross.svg?react';
import { Node } from '@react-types/shared';
import { ButtonHTMLAttributes, DetailedHTMLProps, forwardRef } from 'react';
import { Tab } from 'src/store/tabs';
import { twMerge } from 'tailwind-merge';

type IProps = DetailedHTMLProps<
    ButtonHTMLAttributes<HTMLButtonElement>,
    HTMLButtonElement
> & {
    as: React.ElementType;
    item: Node<Tab> | string;
    onCloseTab?: (tab: Tab) => void;
};

export default forwardRef(function TabButton(props: IProps, ref) {
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
            className={twMerge(
                `mr-3 flex min-w-fit max-w-[144px] cursor-pointer
            items-center justify-between truncate rounded-md
            border border-slate-100 px-4 py-1.5 text-gray-500 outline-none
            last-of-type:mr-0 hover:bg-slate-50 hover:shadow-button aria-selected:border-transparent aria-selected:bg-slate-100 aria-selected:shadow-button
            `,
                className,
            )}
            ref={ref}
            {...buttonProps}
        >
            <span>{typeof item === 'string' ? item : item.rendered}</span>
            <div
                className="ml-3 mt-px flex size-5 items-center justify-center rounded-full hover:bg-slate-50 hover:text-slate-800"
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
