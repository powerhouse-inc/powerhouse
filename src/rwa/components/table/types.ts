import { DivProps } from '@/powerhouse';
import {
    Account,
    CashAsset,
    FixedIncome,
    FixedIncomeType,
    GroupTransaction,
    GroupTransactionType,
    SPV,
    ServiceProviderFeeType,
} from '@/rwa';
import { ComponentType, ReactNode } from 'react';
import { FieldValues, SubmitHandler, UseFormReturn } from 'react-hook-form';

export type TableItem = {
    id: string;
    itemNumber?: number;
} & Record<string, any>;

export type SpecialColumns = {
    index: number;
    moreDetails: null;
};

export interface TableColumn<TItem> {
    key: keyof TItem & string;
    label: ReactNode | null; // Allows JSX or string labels, null for no header
    allowSorting?: boolean;
    isSpecialColumn?: boolean; // Used to identify index or more details columns
    isNumberColumn?: boolean; // Used to right-align numbers
}

export type ColumnCountByTableWidth = Record<number, number>;

export type SortDirection = 'asc' | 'desc';

export type TableBaseProps<TTableData extends TableItem> = DivProps & {
    columns: TableColumn<TTableData>[];
    tableData: TTableData[] | undefined;
    renderRow: (
        item: TTableData,
        columns: TableColumn<TTableData>[],
        index: number,
    ) => JSX.Element;
    onClickSort: (key: string, direction: SortDirection) => void;
    children?: ReactNode;
    footer?: ReactNode;
    hasExpandedRow?: boolean;
    specialFirstRow?: (columns: TableColumn<TableItem>[]) => JSX.Element;
};

export type TableProps<
    TItem extends TableItem,
    TFieldValues extends FieldValues = FieldValues,
    TTableData extends TableItem = TItem,
> = {
    columns: TableColumn<TTableData>[];
    tableData: TTableData[] | undefined;
    itemName: string;
    columnCountByTableWidth?: ColumnCountByTableWidth;
    expandedRowId: string | undefined;
    showNewItemForm: boolean;
    selectedItem: TItem | undefined;
    isAllowedToCreateDocuments: boolean;
    isAllowedToEditDocuments: boolean;
    setSelectedItem: (item: TItem | undefined) => void;
    setShowNewItemForm: (show: boolean) => void;
    toggleExpandedRow: (id: string | undefined) => void;
    onSubmitEdit: (data: TFieldValues) => void;
    onSubmitCreate: (data: TFieldValues) => void;
    onSubmitDelete: (itemId: string) => void;
    editForm: ComponentType<{
        itemId: string;
        itemNumber: number;
        isAllowedToEditDocuments: boolean;
    }>;
    createForm: ComponentType;
    specialFirstRow?: (columns: TableColumn<TableItem>[]) => JSX.Element;
};

export type PropsToKeepFromTable =
    | 'expandedRowId'
    | 'selectedItem'
    | 'setSelectedItem'
    | 'showNewItemForm'
    | 'isAllowedToCreateDocuments'
    | 'isAllowedToEditDocuments'
    | 'setShowNewItemForm'
    | 'toggleExpandedRow'
    | 'onSubmitEdit'
    | 'onSubmitCreate'
    | 'onSubmitDelete'
    | 'specialFirstRow';

export type GroupTransactionsTableProps = Pick<
    TableProps<GroupTransaction, GroupTransactionFormInputs>,
    PropsToKeepFromTable
> & {
    transactions: GroupTransaction[];
    cashAsset: CashAsset | undefined;
    fixedIncomes: FixedIncome[];
    serviceProviderFeeTypes: ServiceProviderFeeType[];
    accounts: Account[];
    principalLenderAccountId: string;
};

export type AssetsTableProps = Pick<
    TableProps<FixedIncome, AssetFormInputs>,
    PropsToKeepFromTable
> & {
    cashAsset: CashAsset | undefined;
    assets: FixedIncome[];
    fixedIncomeTypes: FixedIncomeType[];
    spvs: SPV[];
};

export type ServiceProviderFeeTypesTableProps = Pick<
    TableProps<ServiceProviderFeeType, ServiceProviderFeeTypeFormInputs>,
    PropsToKeepFromTable
> & {
    serviceProviderFeeTypes: ServiceProviderFeeType[];
    accounts: Account[];
};

export type AccountsTableProps = Pick<
    TableProps<Account, AccountFormInputs>,
    PropsToKeepFromTable
> & {
    accounts: Account[];
};

export type SPVsTableProps = Pick<
    TableProps<SPV, SPVFormInputs>,
    PropsToKeepFromTable
> & {
    spvs: SPV[];
};

export type FixedIncomeTypesTableProps = Pick<
    TableProps<FixedIncomeType, FixedIncomeTypeFormInputs>,
    PropsToKeepFromTable
> & {
    fixedIncomeTypes: FixedIncomeType[];
};

export type ItemDetailsFormProps<
    TFieldValues extends FieldValues = FieldValues,
> = Pick<UseFormReturn<TFieldValues>, 'handleSubmit' | 'reset'> & {
    onSubmit: SubmitHandler<TFieldValues>;
    onSubmitDelete: (itemId: string) => void;
};

export type ItemDetailsProps<
    TItem extends TableItem,
    TFieldValues extends FieldValues = FieldValues,
> = Omit<DivProps, 'onSubmit'> &
    ItemDetailsFormProps<TFieldValues> & {
        item?: TItem | undefined;
        itemName: string;
        operation: 'view' | 'create' | 'edit';
        itemNumber: number;
        isAllowedToCreateDocuments: boolean;
        isAllowedToEditDocuments: boolean;
        formInputs: ComponentType;
        setSelectedItem?: (item: TItem | undefined) => void;
        setShowNewItemForm?: (show: boolean) => void;
        onCancel?: () => void;
    };

export type PropsToKeepFromItemDetails =
    | 'item'
    | 'itemNumber'
    | 'itemName'
    | 'operation'
    | 'isAllowedToCreateDocuments'
    | 'isAllowedToEditDocuments'
    | 'setSelectedItem'
    | 'setShowNewItemForm'
    | 'onCancel'
    | 'onSubmitDelete';

export type AssetDetailsProps = Pick<
    ItemDetailsProps<FixedIncome>,
    PropsToKeepFromItemDetails
> & {
    fixedIncomeTypes: FixedIncomeType[];
    spvs: SPV[];
    onSubmitForm: (data: AssetFormInputs) => void;
    onSubmitDelete: (itemId: string) => void;
};

export type GroupTransactionDetailsProps = Pick<
    ItemDetailsProps<GroupTransaction>,
    PropsToKeepFromItemDetails
> & {
    fixedIncomes: FixedIncome[];
    serviceProviderFeeTypes: ServiceProviderFeeType[];
    accounts: Account[];
    onSubmitForm: (data: GroupTransactionFormInputs) => void;
};

export type ServiceProviderFeeTypeDetailsProps = Pick<
    ItemDetailsProps<ServiceProviderFeeType>,
    PropsToKeepFromItemDetails
> & {
    accounts: Account[];
    onSubmitForm: (data: ServiceProviderFeeTypeFormInputs) => void;
};

export type AccountDetailsProps = Pick<
    ItemDetailsProps<Account>,
    PropsToKeepFromItemDetails
> & {
    onSubmitForm: (data: AccountFormInputs) => void;
};

export type SPVDetailsProps = Pick<
    ItemDetailsProps<SPV>,
    PropsToKeepFromItemDetails
> & {
    onSubmitForm: (data: SPVFormInputs) => void;
};

export type FixedIncomeTypeDetailsProps = Pick<
    ItemDetailsProps<FixedIncomeType>,
    PropsToKeepFromItemDetails
> & {
    onSubmitForm: (data: FixedIncomeTypeFormInputs) => void;
};

export type ServiceProviderFeeTypeFormInputs = {
    name?: string | null;
    feeType?: string | null;
    accountId?: string | null;
};

export type AssetFormInputs = {
    fixedIncomeTypeId?: string | null;
    spvId?: string | null;
    maturity?: string;
    name?: string | null;
    ISIN?: string | null;
    CUSIP?: string | null;
    coupon?: number | null;
};

export type TransactionFeeInput = {
    amount?: number | null;
    serviceProviderFeeTypeId?: string | null;
};

export type GroupTransactionFormInputs = {
    type?: GroupTransactionType;
    entryTime?: string;
    fixedIncomeId?: string | null;
    fees?: TransactionFeeInput[] | null;
    cashAmount?: number | null;
    fixedIncomeAmount?: number | null;
    unitPrice: number | null;
    cashBalanceChange: number | null;
};

export type AccountFormInputs = {
    label?: string | null;
    reference?: string | null;
};

export type SPVFormInputs = {
    name?: string | null;
};

export type FixedIncomeTypeFormInputs = {
    name?: string | null;
};
