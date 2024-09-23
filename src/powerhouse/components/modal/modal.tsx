import {
    Content,
    DialogTitle,
    Overlay,
    Portal,
    Root,
} from '@radix-ui/react-dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { ComponentPropsWithoutRef } from 'react';
import { twMerge } from 'tailwind-merge';

type Props = {
    readonly title?: string;
    readonly children?: React.ReactNode;
    readonly open?: boolean;
    readonly onOpenChange?: (open: boolean) => void;
    readonly overlayProps?: ComponentPropsWithoutRef<typeof Overlay>;
    readonly contentProps?: ComponentPropsWithoutRef<typeof Content>;
};
export function Modal(props: Props) {
    const {
        title,
        open,
        onOpenChange,
        contentProps,
        overlayProps,
        children,
        ...delegated
    } = props;
    return (
        <Root defaultOpen={open} onOpenChange={onOpenChange} open={open}>
            <Portal>
                <Overlay
                    {...overlayProps}
                    className={twMerge(
                        'fixed inset-0 grid place-items-center overflow-y-auto bg-slate-900/50 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in',
                        overlayProps?.className,
                    )}
                >
                    <Content
                        {...delegated}
                        {...contentProps}
                        className={twMerge(
                            'bg-white data-[state=closed]:animate-zoom-out data-[state=open]:animate-zoom-in',
                            contentProps?.className,
                        )}
                    >
                        <VisuallyHidden.Root>
                            <DialogTitle>{title}</DialogTitle>
                        </VisuallyHidden.Root>
                        {children}
                    </Content>
                </Overlay>
            </Portal>
        </Root>
    );
}
