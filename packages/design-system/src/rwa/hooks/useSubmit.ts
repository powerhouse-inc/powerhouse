import {
  type FormInputsByTableName,
  type Operation,
  type TableItemType,
  type TableName,
  useEditorContext,
} from "@powerhousedao/design-system";
import { useCallback, useEffect, useMemo } from "react";
import {
  type DefaultValues,
  type FieldValues,
  type SubmitHandler,
  useForm,
} from "react-hook-form";
import { useDefaultFormValues } from "./useDefaultFormValues.js";

function useWrappedForm<TValues extends FieldValues>(defaultValues: TValues) {
  const form = useForm<TValues>({
    defaultValues: defaultValues as DefaultValues<TValues>,
  });

  return form;
}
type Props = {
  operation: Operation;
  tableName: TableName;
  tableItem?: TableItemType<TableName> | null;
};
export function useSubmit(props: Props) {
  const { operation, tableName, tableItem } = props;
  const { handleAction, fixedIncomeTypes, spvs, accounts } = useEditorContext();
  const defaultValues = useDefaultFormValues({
    tableName,
    tableItem,
    fixedIncomeTypes,
    spvs,
    accounts,
  });
  const action = operation === "create" ? "CREATE" : "EDIT";

  const formValues = defaultValues as FormInputsByTableName[TableName];

  const { register, handleSubmit, reset, watch, control, formState } =
    useWrappedForm<FormInputsByTableName[TableName]>(formValues);

  useEffect(() => {
    reset(formValues);
  }, [formValues, reset]);

  const onSubmit: SubmitHandler<FormInputsByTableName[TableName]> = useCallback(
    (payload) => {
      const actionType = `${action}_${tableName}` as const;
      handleAction({
        type: actionType,
        payload,
      });
    },
    [action, handleAction, tableName],
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
