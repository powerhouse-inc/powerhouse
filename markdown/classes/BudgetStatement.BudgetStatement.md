[@acaldas/document-model-libs](../README.md) / [Exports](../modules.md) / [BudgetStatement](../modules/BudgetStatement.md) / BudgetStatement

# Class: BudgetStatement

[BudgetStatement](../modules/BudgetStatement.md).BudgetStatement

Represents a budget statement document.

**`Implements`**

AccountObject, AuditObject, InitObject, LineItemObject, StatusObject, TopupObject

## Hierarchy

- `default`

- `default`

- `default`

- `default`

- `default`

- `default`

- [`BaseDocument`](Document.BaseDocument.md)<[`State`](../modules/BudgetStatement.md#state), [`BudgetStatementAction`](../modules/BudgetStatement.md#budgetstatementaction)\>

  ↳ **`BudgetStatement`**

## Table of contents

### Constructors

- [constructor](BudgetStatement.BudgetStatement.md#constructor)

### Properties

- [state](BudgetStatement.BudgetStatement.md#state)
- [fileExtension](BudgetStatement.BudgetStatement.md#fileextension)

### Accessors

- [created](BudgetStatement.BudgetStatement.md#created)
- [documentType](BudgetStatement.BudgetStatement.md#documenttype)
- [initialState](BudgetStatement.BudgetStatement.md#initialstate)
- [lastModified](BudgetStatement.BudgetStatement.md#lastmodified)
- [month](BudgetStatement.BudgetStatement.md#month)
- [name](BudgetStatement.BudgetStatement.md#name)
- [operations](BudgetStatement.BudgetStatement.md#operations)
- [owner](BudgetStatement.BudgetStatement.md#owner)
- [quoteCurrency](BudgetStatement.BudgetStatement.md#quotecurrency)
- [revision](BudgetStatement.BudgetStatement.md#revision)
- [status](BudgetStatement.BudgetStatement.md#status)

### Methods

- [addAccount](BudgetStatement.BudgetStatement.md#addaccount)
- [addAuditReport](BudgetStatement.BudgetStatement.md#addauditreport)
- [addLineItem](BudgetStatement.BudgetStatement.md#addlineitem)
- [approve](BudgetStatement.BudgetStatement.md#approve)
- [deleteAccount](BudgetStatement.BudgetStatement.md#deleteaccount)
- [deleteAuditReport](BudgetStatement.BudgetStatement.md#deleteauditreport)
- [deleteLineItem](BudgetStatement.BudgetStatement.md#deletelineitem)
- [dispatch](BudgetStatement.BudgetStatement.md#dispatch)
- [escalate](BudgetStatement.BudgetStatement.md#escalate)
- [getAccount](BudgetStatement.BudgetStatement.md#getaccount)
- [getAccounts](BudgetStatement.BudgetStatement.md#getaccounts)
- [getAttachment](BudgetStatement.BudgetStatement.md#getattachment)
- [getAuditReport](BudgetStatement.BudgetStatement.md#getauditreport)
- [getAuditReports](BudgetStatement.BudgetStatement.md#getauditreports)
- [getLineItem](BudgetStatement.BudgetStatement.md#getlineitem)
- [getLineItems](BudgetStatement.BudgetStatement.md#getlineitems)
- [getTopupTransaction](BudgetStatement.BudgetStatement.md#gettopuptransaction)
- [init](BudgetStatement.BudgetStatement.md#init)
- [loadFromFile](BudgetStatement.BudgetStatement.md#loadfromfile)
- [loadState](BudgetStatement.BudgetStatement.md#loadstate)
- [prune](BudgetStatement.BudgetStatement.md#prune)
- [redo](BudgetStatement.BudgetStatement.md#redo)
- [reopenToDraft](BudgetStatement.BudgetStatement.md#reopentodraft)
- [reopenToReview](BudgetStatement.BudgetStatement.md#reopentoreview)
- [requestTopup](BudgetStatement.BudgetStatement.md#requesttopup)
- [saveToFile](BudgetStatement.BudgetStatement.md#savetofile)
- [setName](BudgetStatement.BudgetStatement.md#setname)
- [submitForReview](BudgetStatement.BudgetStatement.md#submitforreview)
- [transferTopup](BudgetStatement.BudgetStatement.md#transfertopup)
- [undo](BudgetStatement.BudgetStatement.md#undo)
- [updateAccount](BudgetStatement.BudgetStatement.md#updateaccount)
- [updateLineItem](BudgetStatement.BudgetStatement.md#updatelineitem)
- [fromFile](BudgetStatement.BudgetStatement.md#fromfile)
- [stateFromFile](BudgetStatement.BudgetStatement.md#statefromfile)

## Constructors

### constructor

• **new BudgetStatement**(`initialState?`)

Creates a new BudgetStatement instance.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `initialState?` | `Partial`<`Omit`<[`BudgetStatementDocument`](../modules/BudgetStatement.md#budgetstatementdocument), ``"data"``\> & { `data`: `Partial`<[`State`](../modules/BudgetStatement.md#state)\>  }\> | An optional object representing the initial state of the BudgetStatement. |

#### Inherited from

[BaseDocument](Document.BaseDocument.md).[constructor](Document.BaseDocument.md#constructor)

#### Defined in

[budget-statement/gen/object.ts:51](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/object.ts#L51)

## Properties

### state

• `Protected` **state**: [`Document`](../modules/Document.md#document)<[`State`](../modules/BudgetStatement.md#state), [`BudgetStatementAction`](../modules/BudgetStatement.md#budgetstatementaction)\>

#### Inherited from

[BaseDocument](Document.BaseDocument.md).[state](Document.BaseDocument.md#state)

#### Defined in

[document/object.ts:13](https://github.com/acaldas/document-model-libs/blob/7166330/src/document/object.ts#L13)

___

### fileExtension

▪ `Static` **fileExtension**: `string` = `'phbs'`

The file extension used to save budget statements.

#### Defined in

[budget-statement/gen/object.ts:44](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/object.ts#L44)

## Accessors

### created

• `get` **created**(): `string`

Gets the timestamp of the date the document was created.

#### Returns

`string`

#### Inherited from

AccountObject.created

#### Defined in

[document/object.ts:88](https://github.com/acaldas/document-model-libs/blob/7166330/src/document/object.ts#L88)

___

### documentType

• `get` **documentType**(): `string`

Gets the type of document.

#### Returns

`string`

#### Inherited from

AccountObject.documentType

#### Defined in

[document/object.ts:81](https://github.com/acaldas/document-model-libs/blob/7166330/src/document/object.ts#L81)

___

### initialState

• `get` **initialState**(): `Omit`<[`Document`](../modules/Document.md#document)<`T`, `A`\>, ``"initialState"``\>

Gets the initial state of the document.

#### Returns

`Omit`<[`Document`](../modules/Document.md#document)<`T`, `A`\>, ``"initialState"``\>

#### Inherited from

AccountObject.initialState

#### Defined in

[document/object.ts:109](https://github.com/acaldas/document-model-libs/blob/7166330/src/document/object.ts#L109)

___

### lastModified

• `get` **lastModified**(): `string`

Gets the timestamp of the date the document was last modified.

#### Returns

`string`

#### Inherited from

AccountObject.lastModified

#### Defined in

[document/object.ts:95](https://github.com/acaldas/document-model-libs/blob/7166330/src/document/object.ts#L95)

___

### month

• `get` **month**(): ``null`` \| `string`

Gets the month of the budget statement.

#### Returns

``null`` \| `string`

#### Defined in

[budget-statement/gen/object.ts:64](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/object.ts#L64)

___

### name

• `get` **name**(): `string`

Gets the name of the document.

#### Returns

`string`

#### Inherited from

AccountObject.name

#### Defined in

[document/object.ts:74](https://github.com/acaldas/document-model-libs/blob/7166330/src/document/object.ts#L74)

___

### operations

• `get` **operations**(): [`Operation`](../modules/Document.md#operation)<`BaseAction` \| `A`\>[]

Gets the list of operations performed on the document.

#### Returns

[`Operation`](../modules/Document.md#operation)<`BaseAction` \| `A`\>[]

#### Inherited from

AccountObject.operations

#### Defined in

[document/object.ts:116](https://github.com/acaldas/document-model-libs/blob/7166330/src/document/object.ts#L116)

___

### owner

• `get` **owner**(): `Object`

Gets the owner of the budget statement.

#### Returns

`Object`

| Name | Type |
| :------ | :------ |
| `id` | ``null`` \| `string` |
| `ref` | ``null`` \| `string` |
| `title` | ``null`` \| `string` |

#### Defined in

[budget-statement/gen/object.ts:71](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/object.ts#L71)

___

### quoteCurrency

• `get` **quoteCurrency**(): ``null`` \| `string`

Gets the quote currency of the budget statement.

#### Returns

``null`` \| `string`

#### Defined in

[budget-statement/gen/object.ts:78](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/object.ts#L78)

___

### revision

• `get` **revision**(): `number`

Gets the revision number of the document.

#### Returns

`number`

#### Inherited from

AccountObject.revision

#### Defined in

[document/object.ts:102](https://github.com/acaldas/document-model-libs/blob/7166330/src/document/object.ts#L102)

___

### status

• `get` **status**(): [`BudgetStatus`](../modules/BudgetStatement.md#budgetstatus)

Gets the current status of the budget statement.

#### Returns

[`BudgetStatus`](../modules/BudgetStatement.md#budgetstatus)

The status of the budget statement.

#### Inherited from

StatusObject.status

#### Defined in

[budget-statement/gen/status/object.ts:56](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/status/object.ts#L56)

## Methods

### addAccount

▸ **addAccount**(`accounts`): [`BudgetStatement`](BudgetStatement.BudgetStatement.md)

Adds one or more accounts to the budget statement.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `accounts` | [`AccountInput`](../modules/BudgetStatement.md#accountinput)[] | An array of AccountInput objects to add. |

#### Returns

[`BudgetStatement`](BudgetStatement.BudgetStatement.md)

#### Inherited from

AccountObject.addAccount

#### Defined in

[budget-statement/gen/account/object.ts:18](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/account/object.ts#L18)

___

### addAuditReport

▸ **addAuditReport**(`reports`): [`BudgetStatement`](BudgetStatement.BudgetStatement.md)

Adds audit reports to the budget statement.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `reports` | { `report`: [`DocumentFile`](../modules/Document.md#documentfile) ; `status`: [`AuditReportStatus`](../modules/BudgetStatement.md#auditreportstatus) ; `timestamp?`: `string`  }[] | An array of audit report objects to add. |

#### Returns

[`BudgetStatement`](BudgetStatement.BudgetStatement.md)

#### Inherited from

AuditObject.addAuditReport

#### Defined in

[budget-statement/gen/audit/object.ts:18](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/audit/object.ts#L18)

___

### addLineItem

▸ **addLineItem**(`account`, `lineItems`): [`BudgetStatement`](BudgetStatement.BudgetStatement.md)

Adds a line item to the specified account.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `account` | `string` | The address of the account to which the line item will be added. |
| `lineItems` | `Partial`<[`LineItem`](../modules/BudgetStatement.md#lineitem)\> & `Pick`<[`LineItem`](../modules/BudgetStatement.md#lineitem), ``"category"`` \| ``"group"``\>[] | An array of line item objects to be added to the account. |

#### Returns

[`BudgetStatement`](BudgetStatement.BudgetStatement.md)

#### Inherited from

LineItemObject.addLineItem

#### Defined in

[budget-statement/gen/line-item/object.ts:20](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/line-item/object.ts#L20)

___

### approve

▸ **approve**(): [`BudgetStatement`](BudgetStatement.BudgetStatement.md)

Approves the budget statement.

#### Returns

[`BudgetStatement`](BudgetStatement.BudgetStatement.md)

#### Inherited from

StatusObject.approve

#### Defined in

[budget-statement/gen/status/object.ts:32](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/status/object.ts#L32)

___

### deleteAccount

▸ **deleteAccount**(`accounts`): [`BudgetStatement`](BudgetStatement.BudgetStatement.md)

Deletes one or more accounts from the budget statement.

#### Parameters

| Name | Type |
| :------ | :------ |
| `accounts` | `string`[] |

#### Returns

[`BudgetStatement`](BudgetStatement.BudgetStatement.md)

#### Inherited from

AccountObject.deleteAccount

#### Defined in

[budget-statement/gen/account/object.ts:34](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/account/object.ts#L34)

___

### deleteAuditReport

▸ **deleteAuditReport**(`reports`): [`BudgetStatement`](BudgetStatement.BudgetStatement.md)

Deletes audit reports from the budget statement.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `reports` | \`attachment://audits/${string}\`[] | An array of objects that contain the report attachment name of the audits items to be deleted. |

#### Returns

[`BudgetStatement`](BudgetStatement.BudgetStatement.md)

#### Inherited from

AuditObject.deleteAuditReport

#### Defined in

[budget-statement/gen/audit/object.ts:32](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/audit/object.ts#L32)

___

### deleteLineItem

▸ **deleteLineItem**(`account`, `lineItems`): [`BudgetStatement`](BudgetStatement.BudgetStatement.md)

Deletes line items for the specified account.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `account` | `string` | The address of the account for which line items will be deleted. |
| `lineItems` | { `category`: `string` ; `group`: `string`  }[] | An array of objects that contain the category and group of the line items to be deleted. |

#### Returns

[`BudgetStatement`](BudgetStatement.BudgetStatement.md)

#### Inherited from

LineItemObject.deleteLineItem

#### Defined in

[budget-statement/gen/line-item/object.ts:44](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/line-item/object.ts#L44)

___

### dispatch

▸ `Protected` **dispatch**(`action`): [`BudgetStatement`](BudgetStatement.BudgetStatement.md)

Dispatches an action to update the state of the document.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `action` | `BaseAction` \| [`BudgetStatementAction`](../modules/BudgetStatement.md#budgetstatementaction) | The action to dispatch. |

#### Returns

[`BudgetStatement`](BudgetStatement.BudgetStatement.md)

The Document instance.

#### Inherited from

[BaseDocument](Document.BaseDocument.md).[dispatch](Document.BaseDocument.md#dispatch)

#### Defined in

[document/object.ts:34](https://github.com/acaldas/document-model-libs/blob/7166330/src/document/object.ts#L34)

___

### escalate

▸ **escalate**(): [`BudgetStatement`](BudgetStatement.BudgetStatement.md)

Escalates the budget statement.

#### Returns

[`BudgetStatement`](BudgetStatement.BudgetStatement.md)

#### Inherited from

StatusObject.escalate

#### Defined in

[budget-statement/gen/status/object.ts:25](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/status/object.ts#L25)

___

### getAccount

▸ **getAccount**(`address`): `undefined` \| [`Account`](../modules/BudgetStatement.md#account)

Returns the Account object with the specified address.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `address` | `string` | The address of the Account to retrieve. |

#### Returns

`undefined` \| [`Account`](../modules/BudgetStatement.md#account)

#### Inherited from

AccountObject.getAccount

#### Defined in

[budget-statement/gen/account/object.ts:49](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/account/object.ts#L49)

___

### getAccounts

▸ **getAccounts**(): [`Account`](../modules/BudgetStatement.md#account)[]

Returns an array of all accounts in the budget statement.

#### Returns

[`Account`](../modules/BudgetStatement.md#account)[]

#### Inherited from

AccountObject.getAccounts

#### Defined in

[budget-statement/gen/account/object.ts:41](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/account/object.ts#L41)

___

### getAttachment

▸ **getAttachment**(`attachment`): [`DocumentFile`](../modules/Document.md#documentfile)

Gets the attachment associated with the given key.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `attachment` | \`attachment://${string}\` | The key of the attachment to retrieve. |

#### Returns

[`DocumentFile`](../modules/Document.md#documentfile)

#### Inherited from

[BaseDocument](Document.BaseDocument.md).[getAttachment](Document.BaseDocument.md#getattachment)

#### Defined in

[document/object.ts:124](https://github.com/acaldas/document-model-libs/blob/7166330/src/document/object.ts#L124)

___

### getAuditReport

▸ **getAuditReport**(`report`): `undefined` \| [`AuditReport`](../modules/BudgetStatement.md#auditreport)

Retrieves a specific audit report from the budget statement.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `report` | \`attachment://audits/${string}\` | The name of the attachment of the report to be retrieved. |

#### Returns

`undefined` \| [`AuditReport`](../modules/BudgetStatement.md#auditreport)

The audit report object if it exists, or undefined if not.

#### Inherited from

AuditObject.getAuditReport

#### Defined in

[budget-statement/gen/audit/object.ts:49](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/audit/object.ts#L49)

___

### getAuditReports

▸ **getAuditReports**(): [`AuditReport`](../modules/BudgetStatement.md#auditreport)[]

Retrieves all audit reports from the budget statement.

#### Returns

[`AuditReport`](../modules/BudgetStatement.md#auditreport)[]

An array of audit report objects.

#### Inherited from

AuditObject.getAuditReports

#### Defined in

[budget-statement/gen/audit/object.ts:40](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/audit/object.ts#L40)

___

### getLineItem

▸ **getLineItem**(`account`, `lineItem`): `undefined` \| [`LineItem`](../modules/BudgetStatement.md#lineitem)

Retrieves a specific line item for the specified account.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `account` | `string` | The address of the account for which the line item will be retrieved. |
| `lineItem` | `Object` | An object that contains the category and group of the line item to be retrieved. |
| `lineItem.category` | `string` | - |
| `lineItem.group` | `string` | - |

#### Returns

`undefined` \| [`LineItem`](../modules/BudgetStatement.md#lineitem)

The line item object that matches the specified category and group, or undefined if it does not exist.

#### Inherited from

LineItemObject.getLineItem

#### Defined in

[budget-statement/gen/line-item/object.ts:68](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/line-item/object.ts#L68)

___

### getLineItems

▸ **getLineItems**(`account`): `undefined` \| [`LineItem`](../modules/BudgetStatement.md#lineitem)[]

Retrieves line items for the specified account.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `account` | `string` | The address of the account for which line items will be retrieved. |

#### Returns

`undefined` \| [`LineItem`](../modules/BudgetStatement.md#lineitem)[]

An array of line item objects for the specified account, or undefined if the account does not exist.

#### Inherited from

LineItemObject.getLineItems

#### Defined in

[budget-statement/gen/line-item/object.ts:56](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/line-item/object.ts#L56)

___

### getTopupTransaction

▸ **getTopupTransaction**(`account`): `undefined` \| { `id`: ``null`` \| `string` ; `requestedValue`: ``null`` \| `number` ; `value`: ``null`` \| `number`  }

Gets the top-up transaction for the specified account.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `account` | `string` | The address of the account to get the top-up transaction for. |

#### Returns

`undefined` \| { `id`: ``null`` \| `string` ; `requestedValue`: ``null`` \| `number` ; `value`: ``null`` \| `number`  }

The top-up transaction for the specified account, if it exists.

#### Inherited from

TopupObject.getTopupTransaction

#### Defined in

[budget-statement/gen/topup/object.ts:42](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/topup/object.ts#L42)

___

### init

▸ **init**(`budgetStatement`): [`BudgetStatement`](BudgetStatement.BudgetStatement.md)

Initializes the state of the budget statement with the provided partial object.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `budgetStatement` | `Partial`<`Omit`<[`BudgetStatementDocument`](../modules/BudgetStatement.md#budgetstatementdocument), ``"data"``\> & { `data`: `Partial`<[`State`](../modules/BudgetStatement.md#state)\>  }\> | A partial object of the budget statement to initialize. |

#### Returns

[`BudgetStatement`](BudgetStatement.BudgetStatement.md)

#### Inherited from

InitObject.init

#### Defined in

[budget-statement/gen/init/object.ts:18](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/init/object.ts#L18)

___

### loadFromFile

▸ **loadFromFile**(`path`): `Promise`<`void`\>

Loads the budget statement from a file.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `path` | `string` | The path to the file to load. |

#### Returns

`Promise`<`void`\>

A promise that resolves with the loaded `BudgetStatement` instance.

#### Inherited from

[BaseDocument](Document.BaseDocument.md).[loadFromFile](Document.BaseDocument.md#loadfromfile)

#### Defined in

[budget-statement/gen/object.ts:98](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/object.ts#L98)

___

### loadState

▸ **loadState**(`state`, `operations`): `void`

Loads a document state and a set of operations.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `state` | `Pick`<[`Document`](../modules/Document.md#document)<[`State`](../modules/BudgetStatement.md#state), [`BudgetStatementAction`](../modules/BudgetStatement.md#budgetstatementaction)\>, ``"name"`` \| ``"data"``\> | The state to load. |
| `operations` | `number` | The operations to apply to the document. |

#### Returns

`void`

#### Inherited from

[BaseDocument](Document.BaseDocument.md).[loadState](Document.BaseDocument.md#loadstate)

#### Defined in

[document/object.ts:165](https://github.com/acaldas/document-model-libs/blob/7166330/src/document/object.ts#L165)

___

### prune

▸ **prune**(`start?`, `end?`): `void`

Removes a range of operations from the document.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `start?` | `number` | The starting index of the range to remove. |
| `end?` | `number` | The ending index of the range to remove. |

#### Returns

`void`

#### Inherited from

[BaseDocument](Document.BaseDocument.md).[prune](Document.BaseDocument.md#prune)

#### Defined in

[document/object.ts:156](https://github.com/acaldas/document-model-libs/blob/7166330/src/document/object.ts#L156)

___

### redo

▸ **redo**(`count`): `void`

Reapplies a number of actions to the document.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `count` | `number` | The number of actions to reapply. |

#### Returns

`void`

#### Inherited from

[BaseDocument](Document.BaseDocument.md).[redo](Document.BaseDocument.md#redo)

#### Defined in

[document/object.ts:148](https://github.com/acaldas/document-model-libs/blob/7166330/src/document/object.ts#L148)

___

### reopenToDraft

▸ **reopenToDraft**(): [`BudgetStatement`](BudgetStatement.BudgetStatement.md)

Reopens the budget statement to draft status.

#### Returns

[`BudgetStatement`](BudgetStatement.BudgetStatement.md)

A promise that resolves when the action is complete.

#### Inherited from

StatusObject.reopenToDraft

#### Defined in

[budget-statement/gen/status/object.ts:40](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/status/object.ts#L40)

___

### reopenToReview

▸ **reopenToReview**(): [`BudgetStatement`](BudgetStatement.BudgetStatement.md)

Reopens the budget statement to review status.

#### Returns

[`BudgetStatement`](BudgetStatement.BudgetStatement.md)

A promise that resolves when the action is complete.

#### Inherited from

StatusObject.reopenToReview

#### Defined in

[budget-statement/gen/status/object.ts:48](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/status/object.ts#L48)

___

### requestTopup

▸ **requestTopup**(`account`, `value`): [`BudgetStatement`](BudgetStatement.BudgetStatement.md)

Adds a top-up request for the specified account.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `account` | `string` | The address of the account to add the top-up request. |
| `value` | `number` | The value of the top-up request. |

#### Returns

[`BudgetStatement`](BudgetStatement.BudgetStatement.md)

#### Inherited from

TopupObject.requestTopup

#### Defined in

[budget-statement/gen/topup/object.ts:15](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/topup/object.ts#L15)

___

### saveToFile

▸ **saveToFile**(`path`): `Promise`<`string`\>

Saves the budget statement to a file.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `path` | `string` | The path to the file to save. |

#### Returns

`Promise`<`string`\>

A promise that resolves when the save operation completes.

#### Inherited from

[BaseDocument](Document.BaseDocument.md).[saveToFile](Document.BaseDocument.md#savetofile)

#### Defined in

[budget-statement/gen/object.ts:88](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/object.ts#L88)

___

### setName

▸ **setName**(`name`): `void`

Sets the name of the document.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `name` | `string` | The new name of the document. |

#### Returns

`void`

#### Inherited from

[BaseDocument](Document.BaseDocument.md).[setName](Document.BaseDocument.md#setname)

#### Defined in

[document/object.ts:132](https://github.com/acaldas/document-model-libs/blob/7166330/src/document/object.ts#L132)

___

### submitForReview

▸ **submitForReview**(): [`BudgetStatement`](BudgetStatement.BudgetStatement.md)

Submits the budget statement for review.

#### Returns

[`BudgetStatement`](BudgetStatement.BudgetStatement.md)

#### Inherited from

StatusObject.submitForReview

#### Defined in

[budget-statement/gen/status/object.ts:18](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/status/object.ts#L18)

___

### transferTopup

▸ **transferTopup**(`account`, `value`, `transaction`): [`BudgetStatement`](BudgetStatement.BudgetStatement.md)

Adds a top-up transer to the specified account.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `account` | `string` | The address of the account to add the top-up transfer. |
| `value` | `number` | The value of the top-up transfer. |
| `transaction` | `string` | The transaction ID of the transfer. |

#### Returns

[`BudgetStatement`](BudgetStatement.BudgetStatement.md)

#### Inherited from

TopupObject.transferTopup

#### Defined in

[budget-statement/gen/topup/object.ts:27](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/topup/object.ts#L27)

___

### undo

▸ **undo**(`count`): `void`

Reverts a number of actions from the document.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `count` | `number` | The number of actions to revert. |

#### Returns

`void`

#### Inherited from

[BaseDocument](Document.BaseDocument.md).[undo](Document.BaseDocument.md#undo)

#### Defined in

[document/object.ts:140](https://github.com/acaldas/document-model-libs/blob/7166330/src/document/object.ts#L140)

___

### updateAccount

▸ **updateAccount**(`accounts`): [`BudgetStatement`](BudgetStatement.BudgetStatement.md)

Updates one or more existing accounts in the budget statement.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `accounts` | [`AccountInput`](../modules/BudgetStatement.md#accountinput)[] | An array of AccountInput objects to update. |

#### Returns

[`BudgetStatement`](BudgetStatement.BudgetStatement.md)

#### Inherited from

AccountObject.updateAccount

#### Defined in

[budget-statement/gen/account/object.ts:26](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/account/object.ts#L26)

___

### updateLineItem

▸ **updateLineItem**(`account`, `lineItems`): [`BudgetStatement`](BudgetStatement.BudgetStatement.md)

Updates line items for the specified account.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `account` | `string` | The address of the account for which line items will be updated. |
| `lineItems` | [`LineItemInput`](../modules/BudgetStatement.md#lineiteminput)[] | An array of line item input objects to be updated. |

#### Returns

[`BudgetStatement`](BudgetStatement.BudgetStatement.md)

#### Inherited from

LineItemObject.updateLineItem

#### Defined in

[budget-statement/gen/line-item/object.ts:32](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/line-item/object.ts#L32)

___

### fromFile

▸ `Static` **fromFile**(`path`): `Promise`<[`BudgetStatement`](BudgetStatement.BudgetStatement.md)\>

Creates a new `BudgetStatement` instance from a file.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `path` | `string` | The path to the file to load. |

#### Returns

`Promise`<[`BudgetStatement`](BudgetStatement.BudgetStatement.md)\>

A promise that resolves with the loaded `BudgetStatement` instance.

#### Defined in

[budget-statement/gen/object.ts:108](https://github.com/acaldas/document-model-libs/blob/7166330/src/budget-statement/gen/object.ts#L108)

___

### stateFromFile

▸ `Static` `Protected` **stateFromFile**<`T`, `A`\>(`path`, `reducer`): `Promise`<[`Document`](../modules/Document.md#document)<`T`, `BaseAction` \| `A`\>\>

Loads the state of the document from a file and returns it.

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | `T` |
| `A` | extends [`Action`](../modules/Document.md#action)<`string`\> |

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `path` | `string` | The file path where the state is stored. |
| `reducer` | [`Reducer`](../modules/Document.md#reducer)<`T`, `BaseAction` \| `A`\> | The reducer function that updates the state. |

#### Returns

`Promise`<[`Document`](../modules/Document.md#document)<`T`, `BaseAction` \| `A`\>\>

The state of the document.

#### Inherited from

[BaseDocument](Document.BaseDocument.md).[stateFromFile](Document.BaseDocument.md#statefromfile)

#### Defined in

[document/object.ts:63](https://github.com/acaldas/document-model-libs/blob/7166330/src/document/object.ts#L63)
