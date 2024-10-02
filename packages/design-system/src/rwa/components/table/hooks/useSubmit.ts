import { Operation } from '@/rwa';
import { useCallback, useMemo } from 'react';
import {
    DefaultValues,
    FieldValues,
    SubmitHandler,
    useForm,
} from 'react-hook-form';

type Props<TFieldValues extends FieldValues> = {
    operation: Operation;
    createDefaultValues: DefaultValues<TFieldValues>;
    editDefaultValues: DefaultValues<TFieldValues>;
    onSubmitCreate: (data: TFieldValues) => void;
    onSubmitEdit?: (data: TFieldValues) => void;
    onSubmitDelete?: (itemId: string) => void;
    customSubmitHandler?: SubmitHandler<TFieldValues>;
};
export function useSubmit<TFieldValues extends FieldValues>(
    props: Props<TFieldValues>,
) {
    const {
        operation,
        createDefaultValues,
        editDefaultValues,
        onSubmitCreate,
        onSubmitEdit,
        onSubmitDelete,
        customSubmitHandler,
    } = props;

    const defaultValues =
        operation === 'create' ? createDefaultValues : editDefaultValues;

    const { register, handleSubmit, reset, watch, control, formState } =
        useForm<TFieldValues>({
            defaultValues,
        });

    const onSubmit: SubmitHandler<TFieldValues> = useCallback(
        data => {
            if (!operation || operation === 'view') return;
            if (customSubmitHandler) {
                customSubmitHandler(data);
                return;
            }
            const formActions = {
                create: onSubmitCreate,
                edit: onSubmitEdit,
                delete: onSubmitDelete,
            };
            const onSubmitForm = formActions[operation];
            onSubmitForm?.(data);
        },
        [
            customSubmitHandler,
            onSubmitCreate,
            onSubmitDelete,
            onSubmitEdit,
            operation,
        ],
    );

    const submit = handleSubmit(onSubmit);

    return useMemo(
        () => ({
            register,
            reset,
            watch,
            control,
            formState,
            submit,
        }),
        [control, formState, register, reset, submit, watch],
    );
}
