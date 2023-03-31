[@acaldas/document-model-libs](../README.md) / [Exports](../modules.md) / [BudgetStatement](BudgetStatement.md) / actions

# Namespace: actions

[BudgetStatement](BudgetStatement.md).actions

## Table of contents

### Account

- [addAccount](BudgetStatement.actions.md#addaccount)
- [deleteAccount](BudgetStatement.actions.md#deleteaccount)
- [updateAccount](BudgetStatement.actions.md#updateaccount)

### Audit

- [addAuditReport](BudgetStatement.actions.md#addauditreport)
- [deleteAuditReport](BudgetStatement.actions.md#deleteauditreport)

### Line Item

- [addLineItem](BudgetStatement.actions.md#addlineitem)
- [deleteLineItem](BudgetStatement.actions.md#deletelineitem)
- [updateLineItem](BudgetStatement.actions.md#updatelineitem)

### Status

- [approve](BudgetStatement.actions.md#approve)
- [escalate](BudgetStatement.actions.md#escalate)
- [reopenToDraft](BudgetStatement.actions.md#reopentodraft)
- [reopenToReview](BudgetStatement.actions.md#reopentoreview)
- [submitForReview](BudgetStatement.actions.md#submitforreview)

### Init

- [init](BudgetStatement.actions.md#init)

### Topup

- [requestTopup](BudgetStatement.actions.md#requesttopup)
- [transferTopup](BudgetStatement.actions.md#transfertopup)

## Account

### addAccount

▸ **addAccount**(`accounts`): `AddAccountAction`

Action creator for adding accounts to the budget statement.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `accounts` | [`AccountInput`](BudgetStatement.md#accountinput)[] | Array of account inputs to be added. |

#### Returns

`AddAccountAction`

#### Defined in

[budget-statement/gen/account/creators.ts:24](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/gen/account/creators.ts#L24)

___

### deleteAccount

▸ **deleteAccount**(`accounts`): `DeleteAccountAction`

Action creator for deleting accounts from the budget statement.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `accounts` | `string`[] | Array of addresses of the accounts to be deleted. |

#### Returns

`DeleteAccountAction`

#### Defined in

[budget-statement/gen/account/creators.ts:42](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/gen/account/creators.ts#L42)

___

### updateAccount

▸ **updateAccount**(`accounts`): `UpdateAccountAction`

Action creator for updating accounts in the budget statement.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `accounts` | [`AccountInput`](BudgetStatement.md#accountinput)[] | Array of account inputs to be updated. |

#### Returns

`UpdateAccountAction`

#### Defined in

[budget-statement/gen/account/creators.ts:34](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/gen/account/creators.ts#L34)

## Audit

### addAuditReport

▸ **addAuditReport**(`reports`): `AddAuditReportAction`

Creates an action to add one or more audit reports to the store.

**`Remarks`**

The `timestamp` property in each report is optional. If not provided, the current time will be used.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `reports` | { `report`: [`DocumentFile`](Document.md#documentfile) ; `status`: [`AuditReportStatus`](BudgetStatement.md#auditreportstatus) ; `timestamp?`: `string`  }[] | An array of objects representing the audit reports to add. |

#### Returns

`AddAuditReportAction`

#### Defined in

[budget-statement/gen/audit/creators.ts:21](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/gen/audit/creators.ts#L21)

___

### deleteAuditReport

▸ **deleteAuditReport**(`reports`): `DeleteAuditReportAction`

Creates an action to delete one or more audit reports from the state.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `reports` | \`attachment://audits/${string}\`[] | An array of reports to be deleted. |

#### Returns

`DeleteAuditReportAction`

The created action.

#### Defined in

[budget-statement/gen/audit/creators.ts:46](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/gen/audit/creators.ts#L46)

## Line Item

### addLineItem

▸ **addLineItem**(`account`, `lineItems`): `AddLineItemAction`

Creates an action to add one or more line items to an account.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `account` | `string` | The account to add line items to. |
| `lineItems` | `Partial`<[`LineItem`](BudgetStatement.md#lineitem)\> & `Pick`<[`LineItem`](BudgetStatement.md#lineitem), ``"category"`` \| ``"group"``\>[] | An array of line items to add to the account. |

#### Returns

`AddLineItemAction`

#### Defined in

[budget-statement/gen/line-item/creators.ts:21](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/gen/line-item/creators.ts#L21)

___

### deleteLineItem

▸ **deleteLineItem**(`account`, `lineItems`): `DeleteLineItemAction`

Creates an action to delete one or more line items from an account.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `account` | `string` | The account containing the line items to delete. |
| `lineItems` | { `category`: `string` ; `group`: `string`  }[] | An array of line items to delete from the account. |

#### Returns

`DeleteLineItemAction`

#### Defined in

[budget-statement/gen/line-item/creators.ts:53](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/gen/line-item/creators.ts#L53)

___

### updateLineItem

▸ **updateLineItem**(`account`, `lineItems`): `UpdateLineItemAction`

Creates an action to update one or more line items in an account.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `account` | `string` | The account containing the line items to update. |
| `lineItems` | [`LineItemInput`](BudgetStatement.md#lineiteminput)[] | An array of line items to update in the account. |

#### Returns

`UpdateLineItemAction`

#### Defined in

[budget-statement/gen/line-item/creators.ts:37](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/gen/line-item/creators.ts#L37)

## Status

### approve

▸ **approve**(): `ApproveAction`

Approves the budget statement.

#### Returns

`ApproveAction`

#### Defined in

[budget-statement/gen/status/creators.ts:35](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/gen/status/creators.ts#L35)

___

### escalate

▸ **escalate**(): `EscalateAction`

Escalates the budget statement if there is any issue.

#### Returns

`EscalateAction`

#### Defined in

[budget-statement/gen/status/creators.ts:28](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/gen/status/creators.ts#L28)

___

### reopenToDraft

▸ **reopenToDraft**(): `ReopenToDraftAction`

Reopens the budget statement to draft state.

#### Returns

`ReopenToDraftAction`

#### Defined in

[budget-statement/gen/status/creators.ts:42](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/gen/status/creators.ts#L42)

___

### reopenToReview

▸ **reopenToReview**(): `ReopenToReviewAction`

Reopens the budget statement to review state.

#### Returns

`ReopenToReviewAction`

#### Defined in

[budget-statement/gen/status/creators.ts:50](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/gen/status/creators.ts#L50)

___

### submitForReview

▸ **submitForReview**(): `SubmitForReviewAction`

Submits the budget statement for review.

#### Returns

`SubmitForReviewAction`

#### Defined in

[budget-statement/gen/status/creators.ts:20](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/gen/status/creators.ts#L20)

## Init

### init

▸ **init**(`budgetStatement`): `InitAction`

Initializes the budget statement state with the provided data.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `budgetStatement` | `Partial`<`Omit`<[`BudgetStatementDocument`](BudgetStatement.md#budgetstatementdocument), ``"data"``\> & { `data`: `Partial`<[`State`](BudgetStatement.md#state)\>  }\> | Partial budget statement data to initialize the state with. |

#### Returns

`InitAction`

#### Defined in

[budget-statement/gen/init/creators.ts:11](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/gen/init/creators.ts#L11)

## Topup

### requestTopup

▸ **requestTopup**(`account`, `value`): `RequestTopupAction`

Action creator for requesting a top-up for an account.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `account` | `string` | The address of the account to top-up. |
| `value` | `number` | The amount to top-up the account by. |

#### Returns

`RequestTopupAction`

#### Defined in

[budget-statement/gen/topup/creators.ts:18](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/gen/topup/creators.ts#L18)

___

### transferTopup

▸ **transferTopup**(`account`, `value`, `transaction`): `TransferTopupAction`

Action creator for transferring top-up to an account.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `account` | `string` | The address of the account to transfer top-up to. |
| `value` | `number` | The amount of top-up to transfer. |
| `transaction` | `string` | The transaction ID of the transfer. |

#### Returns

`TransferTopupAction`

#### Defined in

[budget-statement/gen/topup/creators.ts:30](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/gen/topup/creators.ts#L30)
