[@acaldas/document-model-libs](../README.md) / [Exports](../modules.md) / [BudgetStatement](../modules/BudgetStatement.md) / BudgetStatementObject

# Class: BudgetStatementObject

[BudgetStatement](../modules/BudgetStatement.md).BudgetStatementObject

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

- [`DocumentObject`](Document.DocumentObject.md)<[`State`](../modules/BudgetStatement.md#state), [`BudgetStatementAction`](../modules/BudgetStatement.md#budgetstatementaction)\>

  ↳ **`BudgetStatementObject`**

## Table of contents

### Constructors

- [constructor](BudgetStatement.BudgetStatementObject.md#constructor)

### Properties

- [state](BudgetStatement.BudgetStatementObject.md#state)
- [fileExtension](BudgetStatement.BudgetStatementObject.md#fileextension)

### Accessors

- [created](BudgetStatement.BudgetStatementObject.md#created)
- [documentType](BudgetStatement.BudgetStatementObject.md#documenttype)
- [initialState](BudgetStatement.BudgetStatementObject.md#initialstate)
- [lastModified](BudgetStatement.BudgetStatementObject.md#lastmodified)
- [month](BudgetStatement.BudgetStatementObject.md#month)
- [name](BudgetStatement.BudgetStatementObject.md#name)
- [operations](BudgetStatement.BudgetStatementObject.md#operations)
- [owner](BudgetStatement.BudgetStatementObject.md#owner)
- [quoteCurrency](BudgetStatement.BudgetStatementObject.md#quotecurrency)
- [revision](BudgetStatement.BudgetStatementObject.md#revision)
- [status](BudgetStatement.BudgetStatementObject.md#status)

### Methods

- [addAccount](BudgetStatement.BudgetStatementObject.md#addaccount)
- [addAuditReport](BudgetStatement.BudgetStatementObject.md#addauditreport)
- [addLineItem](BudgetStatement.BudgetStatementObject.md#addlineitem)
- [approve](BudgetStatement.BudgetStatementObject.md#approve)
- [deleteAccount](BudgetStatement.BudgetStatementObject.md#deleteaccount)
- [deleteAuditReport](BudgetStatement.BudgetStatementObject.md#deleteauditreport)
- [deleteLineItem](BudgetStatement.BudgetStatementObject.md#deletelineitem)
- [dispatch](BudgetStatement.BudgetStatementObject.md#dispatch)
- [escalate](BudgetStatement.BudgetStatementObject.md#escalate)
- [getAccount](BudgetStatement.BudgetStatementObject.md#getaccount)
- [getAccounts](BudgetStatement.BudgetStatementObject.md#getaccounts)
- [getAttachment](BudgetStatement.BudgetStatementObject.md#getattachment)
- [getAuditReport](BudgetStatement.BudgetStatementObject.md#getauditreport)
- [getAuditReports](BudgetStatement.BudgetStatementObject.md#getauditreports)
- [getLineItem](BudgetStatement.BudgetStatementObject.md#getlineitem)
- [getLineItems](BudgetStatement.BudgetStatementObject.md#getlineitems)
- [getTopupTransaction](BudgetStatement.BudgetStatementObject.md#gettopuptransaction)
- [init](BudgetStatement.BudgetStatementObject.md#init)
- [loadFromFile](BudgetStatement.BudgetStatementObject.md#loadfromfile)
- [loadState](BudgetStatement.BudgetStatementObject.md#loadstate)
- [prune](BudgetStatement.BudgetStatementObject.md#prune)
- [redo](BudgetStatement.BudgetStatementObject.md#redo)
- [reopenToDraft](BudgetStatement.BudgetStatementObject.md#reopentodraft)
- [reopenToReview](BudgetStatement.BudgetStatementObject.md#reopentoreview)
- [requestTopup](BudgetStatement.BudgetStatementObject.md#requesttopup)
- [saveToFile](BudgetStatement.BudgetStatementObject.md#savetofile)
- [setName](BudgetStatement.BudgetStatementObject.md#setname)
- [submitForReview](BudgetStatement.BudgetStatementObject.md#submitforreview)
- [transferTopup](BudgetStatement.BudgetStatementObject.md#transfertopup)
- [undo](BudgetStatement.BudgetStatementObject.md#undo)
- [updateAccount](BudgetStatement.BudgetStatementObject.md#updateaccount)
- [updateLineItem](BudgetStatement.BudgetStatementObject.md#updatelineitem)
- [fromFile](BudgetStatement.BudgetStatementObject.md#fromfile)
- [stateFromFile](BudgetStatement.BudgetStatementObject.md#statefromfile)

## Constructors

### constructor

• **new BudgetStatementObject**(`initialState?`)

Creates a new BudgetStatementObject instance.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `initialState?` | `Partial`<`Omit`<[`BudgetStatement`](../modules/BudgetStatement.md#budgetstatement), ``"data"``\> & { `data`: `Partial`<[`State`](../modules/BudgetStatement.md#state)\>  }\> | An optional object representing the initial state of the BudgetStatementObject. |

#### Inherited from

[DocumentObject](Document.DocumentObject.md).[constructor](Document.DocumentObject.md#constructor)

#### Defined in

[budget-statement/gen/object.ts:54](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/object.ts#L54)

## Properties

### state

• `Protected` **state**: [`Document`](../modules/Document.md#document)<[`State`](../modules/BudgetStatement.md#state), [`BudgetStatementAction`](../modules/BudgetStatement.md#budgetstatementaction)\>

#### Inherited from

[DocumentObject](Document.DocumentObject.md).[state](Document.DocumentObject.md#state)

#### Defined in

[document/object.ts:13](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/document/object.ts#L13)

___

### fileExtension

▪ `Static` **fileExtension**: `string` = `'phbs'`

The file extension used to save budget statements.

#### Defined in

[budget-statement/gen/object.ts:47](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/object.ts#L47)

## Accessors

### created

• `get` **created**(): `string`

Gets the timestamp of the date the document was created.

#### Returns

`string`

#### Inherited from

AccountObject.created

#### Defined in

[document/object.ts:88](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/document/object.ts#L88)

___

### documentType

• `get` **documentType**(): `string`

Gets the type of document.

#### Returns

`string`

#### Inherited from

AccountObject.documentType

#### Defined in

[document/object.ts:81](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/document/object.ts#L81)

___

### initialState

• `get` **initialState**(): `Omit`<[`Document`](../modules/Document.md#document)<`T`, `A`\>, ``"initialState"``\>

Gets the initial state of the document.

#### Returns

`Omit`<[`Document`](../modules/Document.md#document)<`T`, `A`\>, ``"initialState"``\>

#### Inherited from

AccountObject.initialState

#### Defined in

[document/object.ts:109](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/document/object.ts#L109)

___

### lastModified

• `get` **lastModified**(): `string`

Gets the timestamp of the date the document was last modified.

#### Returns

`string`

#### Inherited from

AccountObject.lastModified

#### Defined in

[document/object.ts:95](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/document/object.ts#L95)

___

### month

• `get` **month**(): ``null`` \| `string`

Gets the month of the budget statement.

#### Returns

``null`` \| `string`

#### Defined in

[budget-statement/gen/object.ts:67](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/object.ts#L67)

___

### name

• `get` **name**(): `string`

Gets the name of the document.

#### Returns

`string`

#### Inherited from

AccountObject.name

#### Defined in

[document/object.ts:74](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/document/object.ts#L74)

___

### operations

• `get` **operations**(): [`Operation`](../modules/Document.md#operation)<`BaseAction` \| `A`\>[]

Gets the list of operations performed on the document.

#### Returns

[`Operation`](../modules/Document.md#operation)<`BaseAction` \| `A`\>[]

#### Inherited from

AccountObject.operations

#### Defined in

[document/object.ts:116](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/document/object.ts#L116)

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

[budget-statement/gen/object.ts:74](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/object.ts#L74)

___

### quoteCurrency

• `get` **quoteCurrency**(): ``null`` \| `string`

Gets the quote currency of the budget statement.

#### Returns

``null`` \| `string`

#### Defined in

[budget-statement/gen/object.ts:81](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/object.ts#L81)

___

### revision

• `get` **revision**(): `number`

Gets the revision number of the document.

#### Returns

`number`

#### Inherited from

AccountObject.revision

#### Defined in

[document/object.ts:102](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/document/object.ts#L102)

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

[budget-statement/gen/status/object.ts:56](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/status/object.ts#L56)

## Methods

### addAccount

▸ **addAccount**(`accounts`): [`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

Adds one or more accounts to the budget statement.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `accounts` | [`AccountInput`](../modules/BudgetStatement.md#accountinput)[] | An array of AccountInput objects to add. |

#### Returns

[`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

#### Inherited from

AccountObject.addAccount

#### Defined in

[budget-statement/gen/account/object.ts:18](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/account/object.ts#L18)

___

### addAuditReport

▸ **addAuditReport**(`reports`): [`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

Adds audit reports to the budget statement.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `reports` | { `report`: { `data`: `string` ; `mimeType`: `string`  } ; `status`: [`AuditReportStatus`](../modules/BudgetStatement.md#auditreportstatus) ; `timestamp?`: `string`  }[] | An array of audit report objects to add. |

#### Returns

[`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

#### Inherited from

AuditObject.addAuditReport

#### Defined in

[budget-statement/gen/audit/object.ts:18](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/audit/object.ts#L18)

___

### addLineItem

▸ **addLineItem**(`account`, `lineItems`): [`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

Adds a line item to the specified account.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `account` | `string` | The address of the account to which the line item will be added. |
| `lineItems` | `Partial`<[`LineItem`](../modules/BudgetStatement.md#lineitem)\> & `Pick`<[`LineItem`](../modules/BudgetStatement.md#lineitem), ``"category"`` \| ``"group"``\>[] | An array of line item objects to be added to the account. |

#### Returns

[`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

#### Inherited from

LineItemObject.addLineItem

#### Defined in

[budget-statement/gen/line-item/object.ts:20](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/line-item/object.ts#L20)

___

### approve

▸ **approve**(): [`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

Approves the budget statement.

#### Returns

[`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

#### Inherited from

StatusObject.approve

#### Defined in

[budget-statement/gen/status/object.ts:32](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/status/object.ts#L32)

___

### deleteAccount

▸ **deleteAccount**(`accounts`): [`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

Deletes one or more accounts from the budget statement.

#### Parameters

| Name | Type |
| :------ | :------ |
| `accounts` | `string`[] |

#### Returns

[`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

#### Inherited from

AccountObject.deleteAccount

#### Defined in

[budget-statement/gen/account/object.ts:34](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/account/object.ts#L34)

___

### deleteAuditReport

▸ **deleteAuditReport**(`reports`): [`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

Deletes audit reports from the budget statement.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `reports` | \`attachment://audits/${string}\`[] | An array of objects that contain the report attachment name of the audits items to be deleted. |

#### Returns

[`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

#### Inherited from

AuditObject.deleteAuditReport

#### Defined in

[budget-statement/gen/audit/object.ts:35](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/audit/object.ts#L35)

___

### deleteLineItem

▸ **deleteLineItem**(`account`, `lineItems`): [`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

Deletes line items for the specified account.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `account` | `string` | The address of the account for which line items will be deleted. |
| `lineItems` | { `category`: `string` ; `group`: `string`  }[] | An array of objects that contain the category and group of the line items to be deleted. |

#### Returns

[`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

#### Inherited from

LineItemObject.deleteLineItem

#### Defined in

[budget-statement/gen/line-item/object.ts:44](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/line-item/object.ts#L44)

___

### dispatch

▸ `Protected` **dispatch**(`action`): [`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

Dispatches an action to update the state of the document.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `action` | `BaseAction` \| [`BudgetStatementAction`](../modules/BudgetStatement.md#budgetstatementaction) | The action to dispatch. |

#### Returns

[`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

The DocumentObject instance.

#### Inherited from

[DocumentObject](Document.DocumentObject.md).[dispatch](Document.DocumentObject.md#dispatch)

#### Defined in

[document/object.ts:34](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/document/object.ts#L34)

___

### escalate

▸ **escalate**(): [`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

Escalates the budget statement.

#### Returns

[`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

#### Inherited from

StatusObject.escalate

#### Defined in

[budget-statement/gen/status/object.ts:25](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/status/object.ts#L25)

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

[budget-statement/gen/account/object.ts:49](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/account/object.ts#L49)

___

### getAccounts

▸ **getAccounts**(): [`Account`](../modules/BudgetStatement.md#account)[]

Returns an array of all accounts in the budget statement.

#### Returns

[`Account`](../modules/BudgetStatement.md#account)[]

#### Inherited from

AccountObject.getAccounts

#### Defined in

[budget-statement/gen/account/object.ts:41](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/account/object.ts#L41)

___

### getAttachment

▸ **getAttachment**(`attachment`): `Object`

Gets the attachment associated with the given key.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `attachment` | \`attachment://${string}\` | The key of the attachment to retrieve. |

#### Returns

`Object`

| Name | Type | Description |
| :------ | :------ | :------ |
| `data` | `string` | The binary data of the attachment in Base64 |
| `mimeType` | `string` | The MIME type of the attachment |

#### Inherited from

[DocumentObject](Document.DocumentObject.md).[getAttachment](Document.DocumentObject.md#getattachment)

#### Defined in

[document/object.ts:124](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/document/object.ts#L124)

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

[budget-statement/gen/audit/object.ts:52](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/audit/object.ts#L52)

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

[budget-statement/gen/audit/object.ts:43](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/audit/object.ts#L43)

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

[budget-statement/gen/line-item/object.ts:68](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/line-item/object.ts#L68)

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

[budget-statement/gen/line-item/object.ts:56](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/line-item/object.ts#L56)

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

[budget-statement/gen/topup/object.ts:42](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/topup/object.ts#L42)

___

### init

▸ **init**(`budgetStatement`): [`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

Initializes the state of the budget statement with the provided partial object.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `budgetStatement` | `Partial`<`Omit`<[`BudgetStatement`](../modules/BudgetStatement.md#budgetstatement), ``"data"``\> & { `data`: `Partial`<[`State`](../modules/BudgetStatement.md#state)\>  }\> | A partial object of the budget statement to initialize. |

#### Returns

[`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

#### Inherited from

InitObject.init

#### Defined in

[budget-statement/gen/init/object.ts:14](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/init/object.ts#L14)

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

A promise that resolves with the loaded `BudgetStatementObject` instance.

#### Inherited from

[DocumentObject](Document.DocumentObject.md).[loadFromFile](Document.DocumentObject.md#loadfromfile)

#### Defined in

[budget-statement/gen/object.ts:101](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/object.ts#L101)

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

[DocumentObject](Document.DocumentObject.md).[loadState](Document.DocumentObject.md#loadstate)

#### Defined in

[document/object.ts:165](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/document/object.ts#L165)

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

[DocumentObject](Document.DocumentObject.md).[prune](Document.DocumentObject.md#prune)

#### Defined in

[document/object.ts:156](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/document/object.ts#L156)

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

[DocumentObject](Document.DocumentObject.md).[redo](Document.DocumentObject.md#redo)

#### Defined in

[document/object.ts:148](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/document/object.ts#L148)

___

### reopenToDraft

▸ **reopenToDraft**(): [`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

Reopens the budget statement to draft status.

#### Returns

[`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

A promise that resolves when the action is complete.

#### Inherited from

StatusObject.reopenToDraft

#### Defined in

[budget-statement/gen/status/object.ts:40](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/status/object.ts#L40)

___

### reopenToReview

▸ **reopenToReview**(): [`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

Reopens the budget statement to review status.

#### Returns

[`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

A promise that resolves when the action is complete.

#### Inherited from

StatusObject.reopenToReview

#### Defined in

[budget-statement/gen/status/object.ts:48](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/status/object.ts#L48)

___

### requestTopup

▸ **requestTopup**(`account`, `value`): [`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

Adds a top-up request for the specified account.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `account` | `string` | The address of the account to add the top-up request. |
| `value` | `number` | The value of the top-up request. |

#### Returns

[`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

#### Inherited from

TopupObject.requestTopup

#### Defined in

[budget-statement/gen/topup/object.ts:15](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/topup/object.ts#L15)

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

[DocumentObject](Document.DocumentObject.md).[saveToFile](Document.DocumentObject.md#savetofile)

#### Defined in

[budget-statement/gen/object.ts:91](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/object.ts#L91)

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

[DocumentObject](Document.DocumentObject.md).[setName](Document.DocumentObject.md#setname)

#### Defined in

[document/object.ts:132](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/document/object.ts#L132)

___

### submitForReview

▸ **submitForReview**(): [`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

Submits the budget statement for review.

#### Returns

[`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

#### Inherited from

StatusObject.submitForReview

#### Defined in

[budget-statement/gen/status/object.ts:18](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/status/object.ts#L18)

___

### transferTopup

▸ **transferTopup**(`account`, `value`, `transaction`): [`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

Adds a top-up transer to the specified account.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `account` | `string` | The address of the account to add the top-up transfer. |
| `value` | `number` | The value of the top-up transfer. |
| `transaction` | `string` | The transaction ID of the transfer. |

#### Returns

[`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

#### Inherited from

TopupObject.transferTopup

#### Defined in

[budget-statement/gen/topup/object.ts:27](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/topup/object.ts#L27)

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

[DocumentObject](Document.DocumentObject.md).[undo](Document.DocumentObject.md#undo)

#### Defined in

[document/object.ts:140](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/document/object.ts#L140)

___

### updateAccount

▸ **updateAccount**(`accounts`): [`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

Updates one or more existing accounts in the budget statement.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `accounts` | [`AccountInput`](../modules/BudgetStatement.md#accountinput)[] | An array of AccountInput objects to update. |

#### Returns

[`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

#### Inherited from

AccountObject.updateAccount

#### Defined in

[budget-statement/gen/account/object.ts:26](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/account/object.ts#L26)

___

### updateLineItem

▸ **updateLineItem**(`account`, `lineItems`): [`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

Updates line items for the specified account.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `account` | `string` | The address of the account for which line items will be updated. |
| `lineItems` | [`LineItemInput`](../modules/BudgetStatement.md#lineiteminput)[] | An array of line item input objects to be updated. |

#### Returns

[`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)

#### Inherited from

LineItemObject.updateLineItem

#### Defined in

[budget-statement/gen/line-item/object.ts:32](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/line-item/object.ts#L32)

___

### fromFile

▸ `Static` **fromFile**(`path`): `Promise`<[`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)\>

Creates a new `BudgetStatementObject` instance from a file.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `path` | `string` | The path to the file to load. |

#### Returns

`Promise`<[`BudgetStatementObject`](BudgetStatement.BudgetStatementObject.md)\>

A promise that resolves with the loaded `BudgetStatementObject` instance.

#### Defined in

[budget-statement/gen/object.ts:111](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/budget-statement/gen/object.ts#L111)

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

[DocumentObject](Document.DocumentObject.md).[stateFromFile](Document.DocumentObject.md#statefromfile)

#### Defined in

[document/object.ts:63](https://github.com/acaldas/document-model-libs/blob/52ea82d/src/document/object.ts#L63)
