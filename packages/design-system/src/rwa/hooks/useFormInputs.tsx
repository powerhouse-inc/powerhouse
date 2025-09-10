import type {
  Account,
  FormInputsByTableName,
  Operation,
  TableItemType,
  TableName,
} from "#rwa";
import {
  allGroupTransactionTypes,
  assetGroupTransactions,
  feesTransactions,
  FeeTransactionsTable,
  formatDateForDisplay,
  groupTransactionTypeLabels,
  handleTableDatum,
  makeFixedIncomeOptionLabel,
  RWANumberInput,
  RWATableSelect,
  RWATableTextInput,
  tableNames,
  TransactionReference,
  UnitPrice,
  useEditorContext,
  useModal,
} from "#rwa";
import type { ReactElement, ReactNode } from "react";
import { useCallback, useMemo } from "react";
import type {
  Control,
  FormState,
  UseFormRegister,
  UseFormWatch,
} from "react-hook-form";
import { EntryTimeLabel } from "../components/inputs/entry-time-label.js";
import { CashBalanceChange } from "../components/table/transactions/cash-balance-change.js";

type Input = {
  label: string;
  Input: () => string | React.JSX.Element;
  inputLabel?: ReactNode | null;
};

type Props = {
  tableName: TableName;
  tableItem: TableItemType<TableName> | undefined | null;
  operation: Operation;
  formState: FormState<FormInputsByTableName[TableName]>;
  register: UseFormRegister<FormInputsByTableName[TableName]>;
  watch: UseFormWatch<FormInputsByTableName[TableName]>;
  control: Control<FormInputsByTableName[TableName]>;
};
export function useFormInputs(props: Props): {
  inputs: Input[];
  additionalInputs?: ReactElement;
} {
  const {
    tableName,
    operation,
    formState: _formState,
    tableItem: _tableItem,
    register: _register,
    watch: _watch,
    control: _control,
  } = props;
  const {
    fixedIncomeTypes,
    spvs,
    serviceProviderFeeTypes,
    accounts,
    fixedIncomes,
  } = useEditorContext();
  const { showModal } = useModal();
  const showCreateItemModal = useCallback(
    (tableName: TableName) => () => {
      showModal("createItem", { tableName });
    },
    [showModal],
  );
  return useMemo(() => {
    switch (tableName) {
      case tableNames.ASSET: {
        const tableItem = _tableItem as TableItemType<"ASSET"> | null;
        type Payload = FormInputsByTableName["ASSET"];
        const register = _register as UseFormRegister<Payload>;
        const formState = _formState as FormState<Payload>;
        const { errors } = formState;

        const control = _control as Control<Payload>;
        const derivedInputsToDisplay: {
          label: string;
          Input: () => React.JSX.Element;
        }[] =
          operation !== "create" && !!tableItem
            ? [
                {
                  label: "Notional",
                  Input: () => <>{handleTableDatum(tableItem.notional)}</>,
                },
                {
                  label: "Purchase Date",
                  Input: () => <>{handleTableDatum(tableItem.purchaseDate)}</>,
                },
                {
                  label: "Purchase Price",
                  Input: () => (
                    <>{handleTableDatum(tableItem.purchasePrice, 6)}</>
                  ),
                },
                {
                  label: "Purchase Proceeds",
                  Input: () => (
                    <>{handleTableDatum(tableItem.purchaseProceeds)}</>
                  ),
                },
              ]
            : [];

        const inputs = [
          {
            label: "Asset Name",
            Input: () => (
              <RWATableTextInput
                {...register("name", {
                  disabled: operation === "view",
                  required: "Asset name is required",
                })}
                aria-invalid={errors.name ? "true" : "false"}
                errorMessage={errors.name?.message}
                inputClassName="text-left"
                placeholder="E.g. My Asset"
              />
            ),
          },
          {
            label: "CUSIP",
            Input: () =>
              operation === "view" ? (
                (tableItem?.CUSIP ?? "Not available")
              ) : (
                <RWATableTextInput
                  {...register("CUSIP", {
                    maxLength: {
                      value: 9,
                      message: "CUSIP cannot be longer than 9 characters",
                    },
                    minLength: {
                      value: 9,
                      message: "CUSIP cannot be shorter than 9 characters",
                    },
                    pattern: {
                      value: /^[a-zA-Z0-9]*$/,
                      message: "CUSIP must be alphanumeric",
                    },
                  })}
                  aria-invalid={errors.CUSIP ? "true" : "false"}
                  errorMessage={errors.CUSIP?.message}
                  placeholder="E.g. A2345B789"
                />
              ),
          },
          {
            label: "ISIN",
            Input: () =>
              operation === "view" ? (
                (tableItem?.ISIN ?? "Not available")
              ) : (
                <RWATableTextInput
                  {...register("ISIN", {
                    maxLength: {
                      value: 12,
                      message: "ISIN cannot be longer than 12 characters",
                    },
                    minLength: {
                      value: 12,
                      message: "ISIN cannot be shorter than 12 characters",
                    },
                    pattern: {
                      value: /^[a-zA-Z0-9]*$/,
                      message: "ISIN must be alphanumeric",
                    },
                  })}
                  aria-invalid={errors.ISIN ? "true" : "false"}
                  errorMessage={errors.ISIN?.message}
                  placeholder="E.g. 123456789ABC"
                />
              ),
          },
          {
            label: "Maturity",
            Input: () => (
              <input
                className="h-8 w-full rounded-md bg-gray-100 px-3 disabled:bg-transparent disabled:p-0"
                step={1}
                type="date"
                {...register("maturity", {
                  disabled: operation === "view",
                })}
              />
            ),
            inputLabel: tableItem?.maturity
              ? formatDateForDisplay(tableItem.maturity, true)
              : null,
          },
          {
            label: "Asset Type",
            Input: () => (
              <RWATableSelect
                addItemButtonProps={{
                  onClick: showCreateItemModal("ASSET"),
                  label: "Create Fixed Income Type",
                }}
                aria-invalid={errors.fixedIncomeTypeId ? "true" : "false"}
                control={control}
                disabled={operation === "view"}
                errorMessage={errors.fixedIncomeTypeId?.message}
                name="fixedIncomeTypeId"
                options={fixedIncomeTypes.map((t) => ({
                  ...t,
                  value: t.id,
                  label: t.name,
                }))}
                rules={{ required: "Asset type is required" }}
              />
            ),
          },
          {
            label: "SPV",
            Input: () => (
              <RWATableSelect
                addItemButtonProps={{
                  onClick: showCreateItemModal("SPV"),
                  label: "Create SPV",
                }}
                aria-invalid={errors.spvId ? "true" : "false"}
                control={control}
                disabled={operation === "view"}
                errorMessage={errors.spvId?.message}
                name="spvId"
                options={spvs.map((t) => ({
                  ...t,
                  value: t.id,
                  label: t.name,
                }))}
                rules={{ required: "SPV is required" }}
              />
            ),
          },
          ...derivedInputsToDisplay,
        ];

        return { inputs };
      }
      case tableNames.TRANSACTION: {
        type Payload = FormInputsByTableName["TRANSACTION"];
        const register = _register as UseFormRegister<Payload>;
        const watch = _watch as UseFormWatch<Payload>;
        const { errors } = _formState as FormState<Payload>;
        const control = _control as Control<Payload>;
        const type = watch("type");
        const isFeesTransaction =
          !!type &&
          feesTransactions.includes(type as (typeof feesTransactions)[number]);
        const isAssetTransaction =
          !!type &&
          assetGroupTransactions.includes(
            type as (typeof assetGroupTransactions)[number],
          );
        const canHaveTransactionFees = !isFeesTransaction;
        const transactionTypeOptions = allGroupTransactionTypes.map((type) => ({
          label: groupTransactionTypeLabels[type],
          value: type,
        }));
        const fixedIncomeOptions = fixedIncomes.map((fixedIncome) => ({
          label: makeFixedIncomeOptionLabel(fixedIncome),
          value: fixedIncome.id,
        }));
        const serviceProviderFeeTypeOptions = serviceProviderFeeTypes.map(
          (spft) => ({
            label: `${spft.name} — ${spft.feeType} — ${accounts.find((account) => account.id === spft.accountId)?.reference}`,
            value: spft.id,
          }),
        );

        const inputs = [
          {
            label: "Transaction Type",
            Input: () => (
              <RWATableSelect
                aria-invalid={errors.type ? "true" : "false"}
                control={control}
                disabled={operation === "view"}
                errorMessage={errors.type?.message}
                name="type"
                options={transactionTypeOptions}
                rules={{
                  required: "Transaction type is required",
                }}
              />
            ),
          },
          {
            label: "Entry Time",
            Input: () => (
              <input
                className="h-8 w-full rounded-md bg-gray-100 px-3 disabled:bg-transparent disabled:p-0"
                step={1}
                type="datetime-local"
                {...register("entryTime", {
                  disabled: operation === "view",
                  required: "Entry time is required",
                })}
              />
            ),
            inputLabel: <EntryTimeLabel control={control} />,
          },
          isFeesTransaction
            ? {
                label: "Service Provider",
                Input: () => (
                  <RWATableSelect
                    addItemButtonProps={{
                      onClick: showCreateItemModal("SERVICE_PROVIDER_FEE_TYPE"),
                      label: "Add Service Provider",
                    }}
                    control={control}
                    disabled={operation === "view"}
                    name="serviceProviderFeeTypeId"
                    options={serviceProviderFeeTypeOptions}
                  />
                ),
              }
            : null,
          isAssetTransaction
            ? {
                label: "Asset name",
                Input: () => (
                  <RWATableSelect
                    addItemButtonProps={{
                      onClick: showCreateItemModal("ASSET"),
                      label: "Create Asset",
                    }}
                    aria-invalid={errors.type ? "true" : "false"}
                    control={control}
                    disabled={operation === "view"}
                    errorMessage={errors.type?.message}
                    name="fixedIncomeId"
                    options={fixedIncomeOptions}
                    rules={{
                      required: "Asset name is required",
                    }}
                  />
                ),
              }
            : undefined,
          isAssetTransaction
            ? {
                label: "Quantity",
                Input: () => (
                  <RWANumberInput
                    aria-invalid={errors.fixedIncomeAmount ? "true" : "false"}
                    control={control}
                    disabled={operation === "view"}
                    errorMessage={errors.fixedIncomeAmount?.message}
                    name="fixedIncomeAmount"
                    placeholder="E.g. 1,000.00"
                    rules={{
                      required: "Quantity is required",
                      validate: {
                        positive: (value) =>
                          (!!value && Number(value) > 0) ||
                          "Asset proceeds must be greater than zero",
                      },
                    }}
                  />
                ),
              }
            : undefined,
          {
            label: isAssetTransaction ? "Asset Proceeds" : "Cash Amount",
            Input: () => (
              <>
                <RWANumberInput
                  aria-invalid={errors.cashAmount ? "true" : "false"}
                  control={control}
                  currency="USD"
                  disabled={operation === "view"}
                  errorMessage={errors.cashAmount?.message}
                  name="cashAmount"
                  placeholder="E.g. $1,000.00"
                  rules={{
                    required: "Asset proceeds is required",
                    validate: {
                      positive: (value) =>
                        (!!value && Number(value) > 0) ||
                        "Asset proceeds must be greater than zero",
                    },
                  }}
                />
                {isAssetTransaction ? (
                  <UnitPrice
                    control={control}
                    isViewOnly={operation === "view"}
                  />
                ) : null}
              </>
            ),
          },
          {
            label: "Transaction reference",
            Input: () => (
              <TransactionReference
                {...register("txRef", {
                  disabled: operation === "view",
                })}
                aria-invalid={errors.txRef ? "true" : "false"}
                control={control}
                errorMessage={errors.txRef?.message}
                placeholder="E.g. 0x123..."
              />
            ),
          },
        ].filter(Boolean) as Input[];

        const additionalInputs = (
          <>
            <FeeTransactionsTable
              canHaveTransactionFees={canHaveTransactionFees}
              control={control}
              errors={errors}
              isViewOnly={operation === "view"}
              serviceProviderFeeTypeOptions={serviceProviderFeeTypeOptions}
              serviceProviderFeeTypes={serviceProviderFeeTypes}
              showCreateServiceProviderFeeTypeModal={showCreateItemModal(
                "SERVICE_PROVIDER_FEE_TYPE",
              )}
            />
            <CashBalanceChange control={control} />
          </>
        );

        return { inputs, additionalInputs };
      }
      case tableNames.ACCOUNT: {
        type Payload = FormInputsByTableName["ACCOUNT"];
        const register = _register as UseFormRegister<Payload>;
        const formState = _formState as FormState<Payload>;
        const { errors } = formState;
        const inputs = [
          {
            label: "Account Label",
            Input: () => (
              <RWATableTextInput
                {...register("label", {
                  disabled: operation === "view",
                  required: "Account label is required",
                })}
                aria-invalid={
                  errors.label?.type === "required" ? "true" : "false"
                }
                errorMessage={errors.label?.message}
                placeholder="E.g. My Label"
              />
            ),
          },
          {
            label: "Account Reference",
            Input: () => (
              <RWATableTextInput
                {...register("reference", {
                  disabled: operation === "view",
                  required: "Account reference is required",
                })}
                aria-invalid={
                  errors.reference?.type === "required" ? "true" : "false"
                }
                errorMessage={errors.reference?.message}
                placeholder="E.g. bank account number or ETH address"
              />
            ),
          },
        ];
        return { inputs };
      }
      case tableNames.SPV: {
        type Payload = FormInputsByTableName["SPV"];
        const register = _register as UseFormRegister<Payload>;
        const formState = _formState as FormState<Payload>;
        const { errors } = formState;

        const inputs = [
          {
            label: "SPV name",
            Input: () => (
              <RWATableTextInput
                {...register("name", {
                  disabled: operation === "view",
                  required: "SPV name is required",
                })}
                aria-invalid={
                  errors.name?.type === "required" ? "true" : "false"
                }
                errorMessage={errors.name?.message}
                placeholder="E.g. My SPV name"
              />
            ),
          },
        ];

        return { inputs };
      }
      case tableNames.FIXED_INCOME_TYPE: {
        type Payload = FormInputsByTableName["FIXED_INCOME_TYPE"];
        const register = _register as UseFormRegister<Payload>;
        const formState = _formState as FormState<Payload>;
        const { errors } = formState;

        const inputs = [
          {
            label: "Fixed Income Type Name",
            Input: () => (
              <RWATableTextInput
                {...register("name", {
                  disabled: operation === "view",
                  required: "Fixed Income Type name is required",
                })}
                aria-invalid={
                  errors.name?.type === "required" ? "true" : "false"
                }
                errorMessage={errors.name?.message}
                placeholder="E.g. My Fixed Income Type name"
              />
            ),
          },
        ];

        return { inputs };
      }
      case tableNames.SERVICE_PROVIDER_FEE_TYPE: {
        type Payload = FormInputsByTableName["SERVICE_PROVIDER_FEE_TYPE"];
        const register = _register as UseFormRegister<Payload>;
        const formState = _formState as FormState<Payload>;
        const { errors } = formState;
        const control = _control as Control<Payload>;

        const makeAccountLabel = (account: Account) => {
          return `${account.label} (${account.reference})`;
        };

        const makeAccountOptions = (accounts: Account[]) => {
          return accounts.map((account) => ({
            ...account,
            value: account.id,
            label: makeAccountLabel(account),
          }));
        };

        const inputs = [
          {
            label: "Service Provider Name",
            Input: () => (
              <RWATableTextInput
                {...register("name", {
                  disabled: operation === "view",
                  required: "Service provider name is required",
                })}
                aria-invalid={
                  errors.name?.type === "required" ? "true" : "false"
                }
                errorMessage={errors.name?.message}
                placeholder="E.g. My Service Provider"
              />
            ),
          },
          {
            label: "Fee Type",
            Input: () => (
              <RWATableTextInput
                {...register("feeType", {
                  disabled: operation === "view",
                  required: "Fee type is required",
                })}
                aria-invalid={
                  errors.name?.type === "required" ? "true" : "false"
                }
                errorMessage={errors.name?.message}
                placeholder="E.g. My Fee Type"
              />
            ),
          },
          {
            label: "Account",
            Input: () => (
              <RWATableSelect
                addItemButtonProps={{
                  onClick: showCreateItemModal("ACCOUNT"),
                  label: "Create Account",
                }}
                aria-invalid={errors.accountId ? "true" : "false"}
                control={control}
                disabled={operation === "view"}
                errorMessage={errors.accountId?.message}
                name="accountId"
                options={makeAccountOptions(accounts)}
                rules={{ required: "Account is required" }}
              />
            ),
          },
        ];

        return { inputs };
      }
    }
  }, [
    _formState,
    _control,
    _register,
    _tableItem,
    _watch,
    accounts,
    fixedIncomeTypes,
    fixedIncomes,
    operation,
    serviceProviderFeeTypes,
    showCreateItemModal,
    spvs,
    tableName,
  ]);
}
