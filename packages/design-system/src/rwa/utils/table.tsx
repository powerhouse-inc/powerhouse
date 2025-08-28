import type {
  GroupTransactionType,
  Item,
  ItemData,
  RealWorldAssetsState,
  TableItem,
  TableItemType,
  TableName,
  TransactionFeeInput,
} from "@powerhousedao/design-system";
import {
  assetTransactionSignByTransactionType,
  calculateCurrentValue,
  cashTransactionSignByTransactionType,
  FEES_INCOME,
  feesTransactions,
  formatDateForDisplay,
  FormattedNumber,
  getFixedIncomeAssets,
  groupTransactionTypeLabels,
  isAssetGroupTransactionType,
  isISODate,
} from "@powerhousedao/design-system";
import type { InputMaybe } from "document-model";

export function handleDateInTable(
  maybeDate: string | Date,
  displayTime = true,
) {
  const isDate = maybeDate instanceof Date || isISODate(maybeDate);
  if (isDate) {
    const dateStr =
      maybeDate instanceof Date ? maybeDate.toISOString() : maybeDate;
    return formatDateForDisplay(dateStr, displayTime);
  }
  return maybeDate;
}

export function handleTableDatum(
  datum: ItemData,
  decimalScale = 2,
  displayTime = true,
) {
  if (datum === null || datum === undefined) return "--";

  if (typeof datum === "number")
    return <FormattedNumber decimalScale={decimalScale} value={datum} />;

  return handleDateInTable(datum, displayTime);
}

export function calculateUnitPrice(
  cashAmount: InputMaybe<number>,
  fixedIncomeAmount: InputMaybe<number>,
) {
  if (!cashAmount || !fixedIncomeAmount) return 0;
  return cashAmount / fixedIncomeAmount;
}

export function calculateCashBalanceChange(
  transactionType: InputMaybe<GroupTransactionType>,
  cashAmount: InputMaybe<number>,
  fees: InputMaybe<TransactionFeeInput[]>,
) {
  if (!cashAmount || !transactionType) return 0;

  const sign = cashTransactionSignByTransactionType[transactionType];

  const feeAmounts = (fees?.map((fee) => fee.amount).filter(Boolean) ??
    []) as number[];

  const totalFees = feeAmounts.reduce((acc, fee) => acc + fee, 0);

  return cashAmount * sign - totalFees;
}

function makeFixedIncomeTypesTableData(
  state: RealWorldAssetsState,
): TableItemType<"FIXED_INCOME_TYPE">[] {
  const { fixedIncomeTypes } = state;
  return addItemNumber(fixedIncomeTypes);
}

function makeSPVsTableData(
  state: RealWorldAssetsState,
): TableItemType<"SPV">[] {
  const { spvs } = state;
  return addItemNumber(spvs);
}

function makeAssetsTableData(
  state: RealWorldAssetsState,
): TableItemType<"ASSET">[] {
  const { portfolio, transactions, fixedIncomeTypes } = state;
  const currentDate = new Date();
  const fixedIncomes = getFixedIncomeAssets(portfolio);

  const tableItems = fixedIncomes.map((fixedIncome) => {
    const currentValue = calculateCurrentValue({
      asset: fixedIncome,
      currentDate,
      transactions,
      fixedIncomeTypes,
    });

    return {
      ...fixedIncome,
      currentValue,
    };
  });

  return addItemNumber(tableItems);
}
function maybeAddSignToAmount(amount: number | undefined, sign: 1 | -1) {
  if (!amount) return amount;
  return amount * sign;
}

function makeGroupTransactionsTableData(
  state: RealWorldAssetsState,
): TableItemType<"TRANSACTION">[] {
  const { transactions, portfolio } = state;
  const fixedIncomes = getFixedIncomeAssets(portfolio);

  const tableData = transactions.map((transaction) => {
    const id = transaction.id;
    const entryTime = transaction.entryTime;
    const asset = fixedIncomes.find(
      (asset) => asset.id === transaction.fixedIncomeTransaction?.assetId,
    )?.name;
    const type = transaction.type;
    const typeLabel = groupTransactionTypeLabels[type];
    const cashTransactionSign = cashTransactionSignByTransactionType[type];
    const assetTransactionSign = isAssetGroupTransactionType(type)
      ? assetTransactionSignByTransactionType[type]
      : 1;
    const quantity = maybeAddSignToAmount(
      transaction.fixedIncomeTransaction?.amount,
      assetTransactionSign,
    );
    const cashAmount = maybeAddSignToAmount(
      transaction.cashTransaction.amount,
      cashTransactionSign,
    );
    const totalFees = feesTransactions.includes(
      transaction.type as (typeof feesTransactions)[number],
    )
      ? (maybeAddSignToAmount(
          transaction.cashTransaction.amount,
          transaction.type === FEES_INCOME ? -1 : 1,
        ) ?? 0)
      : (transaction.fees?.reduce((acc, fee) => acc + fee.amount, 0) ?? 0);
    const cashBalanceChange = transaction.cashBalanceChange;

    return {
      ...transaction,
      id,
      type,
      typeLabel,
      entryTime,
      asset,
      quantity,
      cashAmount,
      totalFees,
      cashBalanceChange,
    };
  });

  return addItemNumber(tableData);
}
function makeAccountsTableData(
  state: RealWorldAssetsState,
): TableItemType<"ACCOUNT">[] {
  const { accounts, principalLenderAccountId } = state;

  const withoutPrincipalLender = accounts.filter(
    (account) => account.id !== principalLenderAccountId,
  );
  const tableData = addItemNumber(withoutPrincipalLender);

  return tableData;
}

function makeServiceProviderFeeTypesTableData(
  state: RealWorldAssetsState,
): TableItemType<"SERVICE_PROVIDER_FEE_TYPE">[] {
  const { serviceProviderFeeTypes, accounts } = state;

  const tableData = serviceProviderFeeTypes.map((serviceProviderFeeType) => {
    const account = accounts.find(
      (account) => account.id === serviceProviderFeeType.accountId,
    );

    return {
      ...serviceProviderFeeType,
      accountName: account?.label,
      accountReference: account?.reference,
    };
  });

  return addItemNumber(tableData);
}
function addItemNumber<TItem extends Item>(items: TItem[]) {
  return items.map((item, index) => ({
    ...item,
    itemNumber: index + 1,
  })) as TableItem<TItem>[];
}

export function makeTableData(
  tableName: TableName,
  state: RealWorldAssetsState,
) {
  return tableDataMakersByTableName[tableName](state);
}

export const tableDataMakersByTableName = {
  ASSET: makeAssetsTableData,
  TRANSACTION: makeGroupTransactionsTableData,
  ACCOUNT: makeAccountsTableData,
  FIXED_INCOME_TYPE: makeFixedIncomeTypesTableData,
  SERVICE_PROVIDER_FEE_TYPE: makeServiceProviderFeeTypesTableData,
  SPV: makeSPVsTableData,
} as const;
