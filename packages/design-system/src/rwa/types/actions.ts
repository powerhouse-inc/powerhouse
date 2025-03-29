import {
  type Account,
  type AccountFormInputs,
  type AssetFormInputs,
  type FixedIncome,
  type FixedIncomeType,
  type FixedIncomeTypeFormInputs,
  type GroupTransaction,
  type GroupTransactionFormInputs,
  type ServiceProviderFeeType,
  type ServiceProviderFeeTypeFormInputs,
  type SPV,
  type SPVFormInputs,
  type TableDataByTableName,
  type TableName,
} from "#rwa";

export type FormInputsByTableName = {
  ASSET: AssetFormInputs;
  TRANSACTION: GroupTransactionFormInputs;
  ACCOUNT: AccountFormInputs;
  FIXED_INCOME_TYPE: FixedIncomeTypeFormInputs;
  SERVICE_PROVIDER_FEE_TYPE: ServiceProviderFeeTypeFormInputs;
  SPV: SPVFormInputs;
};

export type ActionOutputByTableName = {
  ASSET: FixedIncome;
  TRANSACTION: GroupTransaction;
  ACCOUNT: Account;
  FIXED_INCOME_TYPE: FixedIncomeType;
  SERVICE_PROVIDER_FEE_TYPE: ServiceProviderFeeType;
  SPV: SPV;
};

interface CreateOrEditAction<
  TOperation extends "CREATE" | "EDIT",
  TTableName extends TableName,
> {
  type: `${TOperation}_${TTableName}`;
  payload: FormInputsByTableName[TTableName];
}

interface DeleteAction<TTableName extends TableName> {
  type: `DELETE_${TTableName}`;
  payload: { id: string };
}

export type EditorAction =
  | CreateOrEditAction<"CREATE", TableName>
  | CreateOrEditAction<"EDIT", TableName>
  | DeleteAction<TableName>;

export type ActionOutputFor<A extends EditorAction> =
  A["type"] extends `${infer Action}_${infer Entity}`
    ? Action extends "DELETE"
      ? undefined
      : ActionOutputByTableName[Entity & keyof ActionOutputByTableName]
    : never;

export type TableNameFor<A extends EditorAction> =
  A["type"] extends `${infer _Action}_${infer Entity}`
    ? Entity & keyof TableDataByTableName
    : never;

export type EditorDispatcher = <TEditorAction extends EditorAction>(
  action: TEditorAction,
) => ActionOutputFor<TEditorAction>;
