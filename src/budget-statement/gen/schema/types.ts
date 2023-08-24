export type Maybe<T> = T | null;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  Attachment: { input: string; output: string; }
  DateTime: { input: string; output: string; }
};

export type Account = {
  __typename?: 'Account';
  address: Scalars['String']['output'];
  lineItems: Array<LineItem>;
  name: Scalars['String']['output'];
};

export type AddAccountInput = {
  address: Scalars['String']['input'];
  lineItems?: InputMaybe<Array<LineItemInput>>;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type AddAuditReportInput = {
  report: Scalars['Attachment']['input'];
  status: AuditReportStatus | `${AuditReportStatus}`;
  timestamp?: InputMaybe<Scalars['DateTime']['input']>;
};

export type AddCommentInput = {
  author?: InputMaybe<CommentAuthorInput>;
  comment: Scalars['String']['input'];
  key?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<BudgetStatus | `${BudgetStatus}`>;
  timestamp?: InputMaybe<Scalars['DateTime']['input']>;
};

export type AddLineItemInput = {
  accountId: Scalars['ID']['input'];
  actual?: InputMaybe<Scalars['Float']['input']>;
  budgetCap?: InputMaybe<Scalars['Float']['input']>;
  category?: InputMaybe<LineItemCategory>;
  comment?: InputMaybe<Scalars['String']['input']>;
  forecast?: InputMaybe<Array<LineItemForecast>>;
  group?: InputMaybe<LineItemGroup>;
  headcountExpense?: InputMaybe<Scalars['Boolean']['input']>;
  payment?: InputMaybe<Scalars['Float']['input']>;
};

export type AddVestingInput = {
  amount?: InputMaybe<Scalars['String']['input']>;
  amountOld?: InputMaybe<Scalars['String']['input']>;
  comment?: InputMaybe<Scalars['String']['input']>;
  currency?: InputMaybe<Scalars['String']['input']>;
  date?: InputMaybe<Scalars['String']['input']>;
  key?: InputMaybe<Scalars['String']['input']>;
  vested?: InputMaybe<Scalars['Boolean']['input']>;
};

export type AuditReport = {
  __typename?: 'AuditReport';
  report: Scalars['Attachment']['output'];
  status: AuditReportStatus | `${AuditReportStatus}`;
  timestamp: Scalars['DateTime']['output'];
};

export type AuditReportStatus =
  | 'Approved'
  | 'ApprovedWithComments'
  | 'Escalated'
  | 'NeedsAction';

export type BudgetStatementInput = AddAccountInput | AddAuditReportInput | AddCommentInput | AddLineItemInput | AddVestingInput | DeleteAccountInput | DeleteAuditReportInput | DeleteCommentInput | DeleteLineItemInput | DeleteVestingInput | SetFtesInput | SetMonthInput | SetOwnerInput | SetQuoteCurrencyInput | SortAccountsInput | SortLineItemsInput | UpdateAccountInput | UpdateCommentInput | UpdateLineItemInput | UpdateVestingInput;

export type BudgetStatementState = {
  __typename?: 'BudgetStatementState';
  accounts: Array<Account>;
  auditReports: Array<AuditReport>;
  comments: Array<Comment>;
  ftes: Maybe<Ftes>;
  month: Maybe<Scalars['String']['output']>;
  owner: Maybe<Owner>;
  quoteCurrency: Maybe<Scalars['String']['output']>;
  vesting: Array<Vesting>;
};

export type BudgetStatus =
  | 'Draft'
  | 'Escalated'
  | 'Final'
  | 'Review';

export type Comment = {
  __typename?: 'Comment';
  author: CommentAuthor;
  comment: Scalars['String']['output'];
  key: Scalars['String']['output'];
  status: BudgetStatus | `${BudgetStatus}`;
  timestamp: Scalars['DateTime']['output'];
};

export type CommentAuthor = {
  __typename?: 'CommentAuthor';
  id: Maybe<Scalars['String']['output']>;
  ref: Maybe<Scalars['String']['output']>;
  roleLabel: Maybe<Scalars['String']['output']>;
  username: Maybe<Scalars['String']['output']>;
};

export type CommentAuthorInput = {
  id?: InputMaybe<Scalars['String']['input']>;
  ref?: InputMaybe<Scalars['String']['input']>;
  roleLabel?: InputMaybe<Scalars['String']['input']>;
  username?: InputMaybe<Scalars['String']['input']>;
};

export type DeleteAccountInput = {
  account: Scalars['String']['input'];
};

export type DeleteAuditReportInput = {
  report: Scalars['String']['input'];
};

export type DeleteCommentInput = {
  comment: Scalars['String']['input'];
};

export type DeleteLineItemInput = {
  accountId: Scalars['ID']['input'];
  category?: InputMaybe<Scalars['String']['input']>;
  group?: InputMaybe<Scalars['String']['input']>;
};

export type DeleteVestingInput = {
  vesting: Scalars['String']['input'];
};

export type Ftes = {
  __typename?: 'Ftes';
  forecast: Array<FtesForecast>;
  value: Scalars['Float']['output'];
};

export type FtesForecast = {
  __typename?: 'FtesForecast';
  month: Scalars['String']['output'];
  value: Scalars['Float']['output'];
};

export type FtesForecastInput = {
  month: Scalars['String']['input'];
  value: Scalars['Float']['input'];
};

export type LineItem = {
  __typename?: 'LineItem';
  actual: Maybe<Scalars['Float']['output']>;
  budgetCap: Maybe<Scalars['Float']['output']>;
  category: Maybe<LineItemCategory>;
  comment: Maybe<Scalars['String']['output']>;
  forecast: Array<LineItemForecast>;
  group: Maybe<LineItemGroup>;
  headcountExpense: Scalars['Boolean']['output'];
  payment: Maybe<Scalars['Float']['output']>;
};

export type LineItemCategory = {
  __typename?: 'LineItemCategory';
  id: Scalars['String']['output'];
  ref: Scalars['String']['output'];
  title: Scalars['String']['output'];
};

export type LineItemForecast = {
  __typename?: 'LineItemForecast';
  budgetCap: Scalars['Float']['output'];
  month: Scalars['String']['output'];
  value: Scalars['Float']['output'];
};

export type LineItemGroup = {
  __typename?: 'LineItemGroup';
  color: Scalars['String']['output'];
  id: Scalars['String']['output'];
  ref: Scalars['String']['output'];
  title: Scalars['String']['output'];
};

export type LineItemInput = {
  actual?: InputMaybe<Scalars['Float']['input']>;
  budgetCap?: InputMaybe<Scalars['Float']['input']>;
  category?: InputMaybe<LineItemCategory>;
  comment?: InputMaybe<Scalars['String']['input']>;
  forecast?: InputMaybe<Array<LineItemForecast>>;
  group?: InputMaybe<LineItemGroup>;
  headcountExpense?: InputMaybe<Scalars['Boolean']['input']>;
  payment?: InputMaybe<Scalars['Float']['input']>;
};

export type LineItemsSortInput = {
  category?: InputMaybe<Scalars['String']['input']>;
  group?: InputMaybe<Scalars['String']['input']>;
};

export type Mutation = {
  __typename?: 'Mutation';
  addAccount: Maybe<BudgetStatementState>;
  addAuditReport: Maybe<BudgetStatementState>;
  addComment: Maybe<BudgetStatementState>;
  addLineItem: Maybe<BudgetStatementState>;
  addVesting: Maybe<BudgetStatementState>;
  deleteAccount: Maybe<BudgetStatementState>;
  deleteAuditReport: Maybe<BudgetStatementState>;
  deleteComment: Maybe<BudgetStatementState>;
  deleteLineItem: Maybe<BudgetStatementState>;
  deleteVesting: Maybe<BudgetStatementState>;
  setFtes: Maybe<BudgetStatementState>;
  setMonth: Maybe<BudgetStatementState>;
  setOwner: Maybe<BudgetStatementState>;
  setQuoteCurrency: Maybe<BudgetStatementState>;
  updateAccount: Maybe<BudgetStatementState>;
  updateComment: Maybe<BudgetStatementState>;
  updateLineItem: Maybe<BudgetStatementState>;
  updateVesting: Maybe<BudgetStatementState>;
};


export type MutationAddAccountArgs = {
  input: AddAccountInput;
};


export type MutationAddAuditReportArgs = {
  input: AddAuditReportInput;
};


export type MutationAddCommentArgs = {
  input: AddCommentInput;
};


export type MutationAddLineItemArgs = {
  input: AddLineItemInput;
};


export type MutationAddVestingArgs = {
  input: AddVestingInput;
};


export type MutationDeleteAccountArgs = {
  input: DeleteAccountInput;
};


export type MutationDeleteAuditReportArgs = {
  input: DeleteAuditReportInput;
};


export type MutationDeleteCommentArgs = {
  input: DeleteCommentInput;
};


export type MutationDeleteLineItemArgs = {
  input: DeleteLineItemInput;
};


export type MutationDeleteVestingArgs = {
  input: DeleteVestingInput;
};


export type MutationSetFtesArgs = {
  input: SetFtesInput;
};


export type MutationSetMonthArgs = {
  input: SetMonthInput;
};


export type MutationSetOwnerArgs = {
  input: SetOwnerInput;
};


export type MutationSetQuoteCurrencyArgs = {
  input: SetQuoteCurrencyInput;
};


export type MutationUpdateAccountArgs = {
  input: UpdateAccountInput;
};


export type MutationUpdateCommentArgs = {
  input: UpdateCommentInput;
};


export type MutationUpdateLineItemArgs = {
  input: UpdateLineItemInput;
};


export type MutationUpdateVestingArgs = {
  input: UpdateVestingInput;
};

export type Owner = {
  __typename?: 'Owner';
  id: Maybe<Scalars['String']['output']>;
  ref: Maybe<Scalars['String']['output']>;
  title: Maybe<Scalars['String']['output']>;
};

export type SetFtesInput = {
  forecast: Array<FtesForecastInput>;
  value: Scalars['Float']['input'];
};

export type SetMonthInput = {
  month: Scalars['String']['input'];
};

export type SetOwnerInput = {
  id?: InputMaybe<Scalars['String']['input']>;
  ref?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
};

export type SetQuoteCurrencyInput = {
  quoteCurrency: Scalars['String']['input'];
};

export type SortAccountsInput = {
  accounts: Array<Scalars['String']['input']>;
};

export type SortLineItemsInput = {
  accountId: Scalars['ID']['input'];
  lineItems: Array<LineItemsSortInput>;
};

export type UpdateAccountInput = {
  address: Scalars['String']['input'];
  lineItems?: InputMaybe<Array<LineItem>>;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateCommentInput = {
  author?: InputMaybe<CommentAuthorInput>;
  comment?: InputMaybe<Scalars['String']['input']>;
  key: Scalars['String']['input'];
  status?: InputMaybe<BudgetStatus | `${BudgetStatus}`>;
  timestamp?: InputMaybe<Scalars['DateTime']['input']>;
};

export type UpdateLineItemInput = {
  accountId: Scalars['ID']['input'];
  actual?: InputMaybe<Scalars['Float']['input']>;
  budgetCap?: InputMaybe<Scalars['Float']['input']>;
  category?: InputMaybe<Scalars['String']['input']>;
  comment?: InputMaybe<Scalars['String']['input']>;
  forecast?: InputMaybe<Array<LineItemForecast>>;
  group?: InputMaybe<Scalars['String']['input']>;
  headcountExpense?: InputMaybe<Scalars['Boolean']['input']>;
  payment?: InputMaybe<Scalars['Float']['input']>;
};

export type UpdateVestingInput = {
  amount?: InputMaybe<Scalars['String']['input']>;
  amountOld?: InputMaybe<Scalars['String']['input']>;
  comment?: InputMaybe<Scalars['String']['input']>;
  currency?: InputMaybe<Scalars['String']['input']>;
  date?: InputMaybe<Scalars['String']['input']>;
  key: Scalars['String']['input'];
  vested?: InputMaybe<Scalars['Boolean']['input']>;
};

export type Vesting = {
  __typename?: 'Vesting';
  amount: Scalars['String']['output'];
  amountOld: Scalars['String']['output'];
  comment: Scalars['String']['output'];
  currency: Scalars['String']['output'];
  date: Scalars['String']['output'];
  key: Scalars['String']['output'];
  vested: Scalars['Boolean']['output'];
};
