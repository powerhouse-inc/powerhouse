[@acaldas/document-model-libs](../README.md) / [Exports](../modules.md) / BudgetStatement

# Namespace: BudgetStatement

The BudgetStatement module provides functionality for managing budget statements.

**`Remarks`**

This module exports the following:
- All the actions available of the BudgetStatement model, as well as those from the base document.
- The reducer which implements the business logic for each action.
- BudgetStatement: A class representing a budget statement object, to manage a budget statement in an imperative way.
- Utility functions to create Budget Statements and load/save to file.

## Table of contents

### Namespaces

- [actions](BudgetStatement.actions.md)
- [utils](BudgetStatement.utils.md)

### Classes

- [BudgetStatement](../classes/BudgetStatement.BudgetStatement.md)

### Type Aliases

- [Account](BudgetStatement.md#account)
- [AccountInput](BudgetStatement.md#accountinput)
- [AuditAttachment](BudgetStatement.md#auditattachment)
- [AuditReport](BudgetStatement.md#auditreport)
- [AuditReportInput](BudgetStatement.md#auditreportinput)
- [AuditReportStatus](BudgetStatement.md#auditreportstatus)
- [BudgetStatementAction](BudgetStatement.md#budgetstatementaction)
- [BudgetStatementDocument](BudgetStatement.md#budgetstatementdocument)
- [BudgetStatus](BudgetStatement.md#budgetstatus)
- [LineItem](BudgetStatement.md#lineitem)
- [LineItemInput](BudgetStatement.md#lineiteminput)
- [State](BudgetStatement.md#state)

### Functions

- [reducer](BudgetStatement.md#reducer)

## Type Aliases

### Account

Ƭ **Account**: `Object`

Represents an account for which expenses are managed in a budget statement.

#### Type declaration

| Name | Type | Description |
| :------ | :------ | :------ |
| `accountBalance` | { `timestamp`: `string` \| ``null`` ; `value`: `number` \| ``null``  } | The balance of the account. |
| `accountBalance.timestamp` | `string` \| ``null`` | The timestamp for which the balance is recorded. |
| `accountBalance.value` | `number` \| ``null`` | The balance value. |
| `address` | `string` | The wallet address associated with the account. |
| `lineItems` | [`LineItem`](BudgetStatement.md#lineitem)[] | The line items associated with the account. |
| `name` | `string` | The name of the account. |
| `targetBalance` | { `comment`: `string` \| ``null`` ; `value`: `number` \| ``null``  } | The target balance of the account. |
| `targetBalance.comment` | `string` \| ``null`` | Any comment associated with the target balance. |
| `targetBalance.value` | `number` \| ``null`` | The target balance value. |
| `topupTransaction` | { `id`: `string` \| ``null`` ; `requestedValue`: `number` \| ``null`` ; `value`: `number` \| ``null``  } | The topup transaction associated with the account. |
| `topupTransaction.id` | `string` \| ``null`` | The ID of the topup transaction. |
| `topupTransaction.requestedValue` | `number` \| ``null`` | The requested value for the topup transaction. |
| `topupTransaction.value` | `number` \| ``null`` | The actual value transferred in the topup transaction. |

#### Defined in

[budget-statement/custom/types.ts:59](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/custom/types.ts#L59)

___

### AccountInput

Ƭ **AccountInput**: `Partial`<[`Account`](BudgetStatement.md#account)\> & `Pick`<[`Account`](BudgetStatement.md#account), ``"address"``\>

Represents the input for creating or updating an account.

**`Remarks`**

The only necessary attribute is the account address,
as it is an unique attribute used to identify the account.

#### Defined in

[budget-statement/custom/types.ts:97](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/custom/types.ts#L97)

___

### AuditAttachment

Ƭ **AuditAttachment**: \`attachment://audits/${string}\`

A string literal type representing the format for attaching audit reports to a budget statement.

#### Defined in

[budget-statement/custom/types.ts:116](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/custom/types.ts#L116)

___

### AuditReport

Ƭ **AuditReport**: `Object`

Represents an audit report for a budget statement.

#### Type declaration

| Name | Type | Description |
| :------ | :------ | :------ |
| `report` | [`AuditAttachment`](BudgetStatement.md#auditattachment) | The attachment for the audit report. |
| `status` | [`AuditReportStatus`](BudgetStatement.md#auditreportstatus) | The status of the audit report. |
| `timestamp` | `string` | The timestamp of the audit report. |

#### Defined in

[budget-statement/custom/types.ts:121](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/custom/types.ts#L121)

___

### AuditReportInput

Ƭ **AuditReportInput**: `Object`

Represents the input for an audit report to be added to a budget statement.

#### Type declaration

| Name | Type | Description |
| :------ | :------ | :------ |
| `report` | [`DocumentFile`](Document.md#documentfile) | The data for the audit report. |
| `status` | [`AuditReportStatus`](BudgetStatement.md#auditreportstatus) | The status of the audit report. |
| `timestamp` | `string` | The timestamp for the audit report. |

#### Defined in

[budget-statement/custom/types.ts:133](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/custom/types.ts#L133)

___

### AuditReportStatus

Ƭ **AuditReportStatus**: ``"Approved"`` \| ``"ApprovedWithComments"`` \| ``"NeedsAction"`` \| ``"Escalated"``

Represents the status of an audit report: 'Approved', 'ApprovedWithComments', 'NeedsAction', or 'Escalated'.

#### Defined in

[budget-statement/custom/types.ts:107](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/custom/types.ts#L107)

___

### BudgetStatementAction

Ƭ **BudgetStatementAction**: `BudgetStatementAccountAction` \| `BudgetStatementInitAction` \| `BudgetStatementLineItemAction` \| `BudgetStatementStatusAction` \| `BudgetStatementTopupAction` \| `BudgetStatementAuditReportAction`

Represents the possible actions that can be performed on a budget statement.

#### Defined in

[budget-statement/custom/types.ts:185](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/custom/types.ts#L185)

___

### BudgetStatementDocument

Ƭ **BudgetStatementDocument**: [`Document`](Document.md#document)<[`State`](BudgetStatement.md#state), [`BudgetStatementAction`](BudgetStatement.md#budgetstatementaction)\>

Represents a budget statement document, which extends the base Document type.

#### Defined in

[budget-statement/custom/types.ts:196](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/custom/types.ts#L196)

___

### BudgetStatus

Ƭ **BudgetStatus**: ``"Draft"`` \| ``"Review"`` \| ``"Final"`` \| ``"Escalated"``

Represents the status of the budget statement: 'Draft', 'Review', 'Final', or 'Escalated'.

#### Defined in

[budget-statement/custom/types.ts:102](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/custom/types.ts#L102)

___

### LineItem

Ƭ **LineItem**: `Object`

Represents an expense item for a specific account.

#### Type declaration

| Name | Type | Description |
| :------ | :------ | :------ |
| `actual` | `number` \| ``null`` | The actual value of the expense. |
| `budgetCap` | `number` \| ``null`` | The budget cap for the expense. |
| `category` | { `headcountExpense`: `boolean` ; `id`: `string` ; `ref`: `string` ; `title`: `string`  } | The reference to the category of the expense. |
| `category.headcountExpense` | `boolean` | - |
| `category.id` | `string` | - |
| `category.ref` | `string` | - |
| `category.title` | `string` | - |
| `forecast` | { `month`: `string` ; `value`: `number`  }[] | The forecast for the next 3 months for that expense. |
| `group` | { `id`: `string` ; `ref`: `string` ; `title`: `string`  } | The reference to the group of the expense. |
| `group.id` | `string` | - |
| `group.ref` | `string` | - |
| `group.title` | `string` | - |
| `payment` | `number` \| ``null`` | The payment done to the wallet in that month. |

#### Defined in

[budget-statement/custom/types.ts:12](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/custom/types.ts#L12)

___

### LineItemInput

Ƭ **LineItemInput**: `Partial`<`Omit`<[`LineItem`](BudgetStatement.md#lineitem), ``"category"`` \| ``"group"``\>\> & { `category`: `string` ; `group`: `string`  }

Represents the input for creating or updating a line item.

**`Remarks`**

The only necessary attributes are the category and the group
as they are used to identify the line item.

#### Defined in

[budget-statement/custom/types.ts:46](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/custom/types.ts#L46)

___

### State

Ƭ **State**: `Object`

Represents the state of a budget statement.

#### Type declaration

| Name | Type | Description |
| :------ | :------ | :------ |
| `accounts` | [`Account`](BudgetStatement.md#account)[] | The list of accounts in the budget statement. |
| `auditReports` | [`AuditReport`](BudgetStatement.md#auditreport)[] | The list of audit reports for the budget statement. |
| `month` | `string` \| ``null`` | The month that the budget statement refers to. |
| `owner` | { `id`: `string` \| ``null`` ; `ref`: `string` \| ``null`` ; `title`: `string` \| ``null``  } | A reference to the owner of the budget statement. |
| `owner.id` | `string` \| ``null`` | - |
| `owner.ref` | `string` \| ``null`` | - |
| `owner.title` | `string` \| ``null`` | - |
| `quoteCurrency` | `string` \| ``null`` | The quote currency for the budget statement. |
| `status` | [`BudgetStatus`](BudgetStatement.md#budgetstatus) | The status of the budget statement. |

#### Defined in

[budget-statement/custom/types.ts:151](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/custom/types.ts#L151)

## Functions

### reducer

▸ **reducer**(`state`, `action`): [`Document`](Document.md#document)<[`State`](BudgetStatement.md#state), [`BudgetStatementAction`](BudgetStatement.md#budgetstatementaction)\>

Reducer for the BudgetStatement module, which handles operations related to budget statements.

**`Remarks`**

This reducer handles the following actions:
- `INIT: initializes the state of the module.
- `ADD_ACCOUNT`: adds an account to the state.
- `UPDATE_ACCOUNT`: updates an account in the state.
- `DELETE_ACCOUNT`: removes an account from the state.
- `ADD_LINE_ITEM`: adds a line item to an account in the state.
- `UPDATE_LINE_ITEM`: updates a line item in an account in the state.
- `DELETE_LINE_ITEM`: removes a line item from an account in the state.
- `SUBMIT_FOR_REVIEW`: updates the status of the budget statement to "Under Review".
- `ESCALATE`: escalates the budget statement to a higher authority.
- `APPROVE`: approves the budget statement.
- `REOPEN_TO_DRAFT`: changes the status of the budget statement to "Draft".
- `REOPEN_TO_REVIEW`: changes the status of the budget statement to "Under Review".
- `REQUEST_TOPUP`: requests a top-up of an account.
- `TRANSFER_TOPUP`: transfers a top-up to an account.
- `ADD_AUDIT_REPORT`: adds an audit report to an account in the state.
- `DELETE_AUDIT_REPORT`: removes an audit report from an account in the state.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `state` | [`Document`](Document.md#document)<[`State`](BudgetStatement.md#state), `BaseAction` \| [`BudgetStatementAction`](BudgetStatement.md#budgetstatementaction)\> | The current state of the module. |
| `action` | `BaseAction` \| [`BudgetStatementAction`](BudgetStatement.md#budgetstatementaction) | The action to be performed on the state. |

#### Returns

[`Document`](Document.md#document)<[`State`](BudgetStatement.md#state), [`BudgetStatementAction`](BudgetStatement.md#budgetstatementaction)\>

The new state after applying the action.

#### Defined in

[document/utils/base.ts:59](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/utils/base.ts#L59)
