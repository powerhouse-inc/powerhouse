import { ChangeEvent, ComponentPropsWithRef, useRef } from 'react';
import { Control, Controller, FieldValues, Path } from 'react-hook-form';
import { twMerge } from 'tailwind-merge';

type Props<TFieldValues extends FieldValues> = Omit<
    ComponentPropsWithRef<'input'>,
    'type' | 'name' | 'value'
> & {
    name: Path<TFieldValues>;
    control: Control<TFieldValues>;
};
export function ImageInput<TFieldValues extends FieldValues>(
    props: Props<TFieldValues>,
) {
    const { className, name, id, control } = props;
    const fileInputRef = useRef<HTMLInputElement>(null);

    function parseImageAsBase64(
        e: ChangeEvent<HTMLInputElement>,
    ): Promise<string | ArrayBuffer | null> {
        return new Promise((resolve, reject) => {
            const file = e.target.files?.[0] ?? null;
            if (file) {
                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve(reader.result);
                };
                reader.onerror = () => {
                    reject(new Error(reader.error?.message));
                };
                reader.readAsDataURL(file);
            } else {
                resolve(null);
            }
        });
    }

    async function getBase64File(e: ChangeEvent<HTMLInputElement>) {
        try {
            const base64String = await parseImageAsBase64(e);
            return base64String as string;
        } catch (error) {
            console.error('Error reading file:', error);
        }
    }

    function handleContainerClick() {
        fileInputRef.current?.click();
    }

    return (
        <Controller
            name={name}
            control={control}
            render={({ field: { onBlur, onChange, value } }) => (
                <div
                    className={twMerge(
                        'flex cursor-pointer items-center gap-2 rounded-xl bg-gray-100 p-3 text-gray-800',
                        className,
                    )}
                    onClick={handleContainerClick}
                >
                    <div className="shrink-0">
                        <img
                            src={value}
                            className="size-7 object-cover"
                            alt="Preview"
                        />
                    </div>
                    <span className="font-semibold">Change Drive Icon</span>
                    <input
                        id={id}
                        ref={fileInputRef}
                        onBlur={onBlur}
                        onChange={async e => {
                            const base64String = await getBase64File(e);
                            onChange(base64String);
                        }}
                        type="file"
                        accept="image/*"
                        className="hidden"
                    />
                </div>
            )}
        ></Controller>
    );
}
