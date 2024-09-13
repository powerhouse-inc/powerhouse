import { FormInput } from '@/connect';
import { Button, Icon, Modal } from '@/powerhouse';
import { ComponentPropsWithoutRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';

const buttonStyles =
    'min-h-[48px] min-w-[142px] text-base font-semibold py-3 px-6 rounded-xl outline-none active:opacity-75 hover:scale-105 transform transition-all';

export type CreateDocumentModalProps = ComponentPropsWithoutRef<
    typeof Modal
> & {
    onContinue: (nodeName: string) => void;
};

export const CreateDocumentModal = (props: CreateDocumentModalProps) => {
    const {
        onOpenChange,
        onContinue,
        overlayProps,
        contentProps,
        ...restProps
    } = props;

    const [nodeName, setNodeName] = useState('');

    return (
        <Modal
            overlayProps={{
                ...overlayProps,
                className: overlayProps?.className,
            }}
            contentProps={{
                ...contentProps,
                className: twMerge('rounded-3xl', contentProps?.className),
            }}
            onOpenChange={onOpenChange}
            {...restProps}
        >
            <div className="w-[400px] p-6 text-slate-300">
                <div className="border-b border-slate-50 pb-2 text-2xl font-bold text-gray-800">
                    Create a new document
                </div>
                <div className="my-6">
                    <FormInput
                        icon={<Icon name="BrickGlobe" />}
                        value={nodeName}
                        placeholder="Document name"
                        required
                        onChange={e => setNodeName(e.target.value)}
                    />
                </div>
                <div className="mt-8 flex justify-between gap-3">
                    <button
                        onClick={() => onOpenChange?.(false)}
                        className={twMerge(
                            buttonStyles,
                            'flex-1 bg-slate-50 text-slate-800',
                        )}
                    >
                        Cancel
                    </button>
                    <Button
                        onClick={() => onContinue(nodeName)}
                        className={twMerge(
                            buttonStyles,
                            'flex-1 bg-gray-800 text-gray-50',
                        )}
                    >
                        Create
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
