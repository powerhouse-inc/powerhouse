import { DivProps } from '@/powerhouse';
import {
    Account,
    Asset,
    FixedIncome,
    FixedIncomeType,
    GroupTransaction,
    GroupTransactionType,
    SPV,
    ServiceProviderFeeType,
} from '@/rwa';
import { ComponentType, ReactNode } from 'react';
import { FieldValues, UseFormReturn } from 'react-hook-form';

export type RealWorldAssetsState = {
    accounts: Account[];
    fixedIncomeTypes: FixedIncomeType[];
    portfolio: Asset[];
    principalLenderAccountId: string;
    serviceProviderFeeTypes: ServiceProviderFeeType[];
    spvs: SPV[];
    transactions: GroupTransaction[];
};

export type TableItem = {
    id: string;
    itemNumber?: number;
    customTransform?: (
        itemData: ItemData,
        columnKey: string,
    ) => ReactNode | undefined;
} & Record<string, any>;

export type ItemData = string | number | Date | null | undefined;

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
    state: RealWorldAssetsState;
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
    | 'state'
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
    onSubmitCreateAsset: (data: AssetFormInputs) => void;
    onSubmitCreateServiceProviderFeeType: (
        data: ServiceProviderFeeTypeFormInputs,
    ) => void;
};

export type AssetsTableProps = Pick<
    TableProps<FixedIncome, AssetFormInputs>,
    PropsToKeepFromTable
> & {
    onSubmitCreateFixedIncomeType: (data: FixedIncomeTypeFormInputs) => void;
    onSubmitCreateSpv: (data: SPVFormInputs) => void;
};

export type ServiceProviderFeeTypesTableProps = Pick<
    TableProps<ServiceProviderFeeType, ServiceProviderFeeTypeFormInputs>,
    PropsToKeepFromTable
> & {
    onSubmitCreateAccount: (data: AccountFormInputs) => void;
};

export type AccountsTableProps = Pick<
    TableProps<Account, AccountFormInputs>,
    PropsToKeepFromTable
>;

export type SPVsTableProps = Pick<
    TableProps<SPV, SPVFormInputs>,
    PropsToKeepFromTable
>;

export type FixedIncomeTypesTableProps = Pick<
    TableProps<FixedIncomeType, FixedIncomeTypeFormInputs>,
    PropsToKeepFromTable
>;

export type ItemDetailsFormProps<
    TFieldValues extends FieldValues = FieldValues,
> = Pick<UseFormReturn<TFieldValues>, 'reset'> & {
    submit: (e?: React.BaseSyntheticEvent | undefined) => Promise<void>;
    onSubmitDelete: (itemId: string) => void;
};

export type ItemDetailsProps<
    TItem extends TableItem,
    TFieldValues extends FieldValues = FieldValues,
> = Omit<DivProps, 'onSubmit'> &
    ItemDetailsFormProps<TFieldValues> & {
        state: RealWorldAssetsState;
        item?: TItem | undefined;
        itemName: string;
        operation: 'view' | 'create' | 'edit';
        itemNumber: number;
        isAllowedToCreateDocuments: boolean;
        isAllowedToEditDocuments: boolean;
        isAllowedToDeleteItem?: boolean;
        hasDependentItems?: boolean;
        formInputs: ComponentType;
        dependentItemProps?: {
            dependentItemName: string;
            dependentItemList: ReactNode[];
        };
        setSelectedItem?: (item: TItem | undefined) => void;
        setShowNewItemForm?: (show: boolean) => void;
        onCancel?: () => void;
    };

export type PropsToKeepFromItemDetails =
    | 'state'
    | 'item'
    | 'itemNumber'
    | 'itemName'
    | 'operation'
    | 'isAllowedToCreateDocuments'
    | 'isAllowedToEditDocuments'
    | 'dependentItemProps'
    | 'setSelectedItem'
    | 'setShowNewItemForm'
    | 'onCancel'
    | 'onSubmitDelete';

export type AssetDetailsProps = Pick<
    ItemDetailsProps<FixedIncome>,
    PropsToKeepFromItemDetails
> & {
    onSubmitForm: (data: AssetFormInputs) => void;
    onSubmitDelete: (itemId: string) => void;
    onSubmitCreateFixedIncomeType: (data: FixedIncomeTypeFormInputs) => void;
    onSubmitCreateSpv: (data: SPVFormInputs) => void;
};

export type GroupTransactionDetailsProps = Pick<
    ItemDetailsProps<GroupTransaction>,
    PropsToKeepFromItemDetails
> & {
    onSubmitForm: (data: GroupTransactionFormInputs) => void;
    onSubmitCreateAsset: (data: AssetFormInputs) => void;
    onSubmitCreateServiceProviderFeeType: (
        data: ServiceProviderFeeTypeFormInputs,
    ) => void;
};

export type ServiceProviderFeeTypeDetailsProps = Pick<
    ItemDetailsProps<ServiceProviderFeeType>,
    PropsToKeepFromItemDetails
> & {
    onSubmitForm: (data: ServiceProviderFeeTypeFormInputs) => void;
    onSubmitCreateAccount: (data: AccountFormInputs) => void;
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
