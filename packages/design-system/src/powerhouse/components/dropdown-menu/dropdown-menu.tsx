import {
    Content,
    DropdownMenuContentProps,
    Item,
    Label,
    Portal,
    Root,
    Trigger,
} from '@radix-ui/react-dropdown-menu';
import { ForwardedRef, forwardRef } from 'react';

export const DropdownMenu = Root;
export const DropdownMenuTrigger = Trigger;

export const DropdownMenuContent = forwardRef(function DropdownMenuContent(
    { children, ...delegatedProps }: DropdownMenuContentProps,
    forwardedRef: ForwardedRef<HTMLDivElement>,
) {
    return (
        <Portal>
            <Content {...delegatedProps} ref={forwardedRef}>
                {children}
            </Content>
        </Portal>
    );
});

export const DropdownMenuLabel = Label;
export const DropdownMenuItem = Item;
