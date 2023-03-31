[@acaldas/document-model-libs](../README.md) / [Exports](../modules.md) / [BudgetStatement](BudgetStatement.md) / utils

# Namespace: utils

[BudgetStatement](BudgetStatement.md).utils

## Table of contents

### Functions

- [createAccount](BudgetStatement.utils.md#createaccount)
- [createBudgetStatement](BudgetStatement.utils.md#createbudgetstatement)
- [createLineItem](BudgetStatement.utils.md#createlineitem)
- [loadBudgetStatementFromFile](BudgetStatement.utils.md#loadbudgetstatementfromfile)
- [saveBudgetStatementToFile](BudgetStatement.utils.md#savebudgetstatementtofile)

## Functions

### createAccount

▸ **createAccount**(`input`): [`Account`](BudgetStatement.md#account)

Creates a new Account with default properties and the given input properties.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `input` | [`AccountInput`](BudgetStatement.md#accountinput) | The input properties of the account. |

#### Returns

[`Account`](BudgetStatement.md#account)

The new Account object.

#### Defined in

[budget-statement/custom/utils.ts:50](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/custom/utils.ts#L50)

___

### createBudgetStatement

▸ **createBudgetStatement**(`initialState?`): [`BudgetStatementDocument`](BudgetStatement.md#budgetstatementdocument)

Creates a new BudgetStatement document with an initial state.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `initialState?` | `Partial`<`Omit`<[`BudgetStatementDocument`](BudgetStatement.md#budgetstatementdocument), ``"data"``\> & { `data`: `Partial`<[`State`](BudgetStatement.md#state)\>  }\> | The initial state of the document. |

#### Returns

[`BudgetStatementDocument`](BudgetStatement.md#budgetstatementdocument)

The new BudgetStatement document.

#### Defined in

[budget-statement/custom/utils.ts:20](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/custom/utils.ts#L20)

___

### createLineItem

▸ **createLineItem**(`input`): [`LineItem`](BudgetStatement.md#lineitem)

Creates a new LineItem with default properties and the given input properties.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `input` | `Partial`<[`LineItem`](BudgetStatement.md#lineitem)\> & `Pick`<[`LineItem`](BudgetStatement.md#lineitem), ``"category"`` \| ``"group"``\> | The input properties of the line item. |

#### Returns

[`LineItem`](BudgetStatement.md#lineitem)

The new LineItem object.

#### Defined in

[budget-statement/custom/utils.ts:74](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/custom/utils.ts#L74)

___

### loadBudgetStatementFromFile

▸ **loadBudgetStatementFromFile**(`path`): `Promise`<[`BudgetStatementDocument`](BudgetStatement.md#budgetstatementdocument)\>

Loads the BudgetStatement document from the specified file path.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `path` | `string` | The file path to load the document from. |

#### Returns

`Promise`<[`BudgetStatementDocument`](BudgetStatement.md#budgetstatementdocument)\>

A promise that resolves with the loaded BudgetStatement document.

#### Defined in

[budget-statement/custom/utils.ts:102](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/custom/utils.ts#L102)

___

### saveBudgetStatementToFile

▸ **saveBudgetStatementToFile**(`document`, `path`): `Promise`<`string`\>

Saves the BudgetStatement document to the specified file path.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `document` | [`BudgetStatementDocument`](BudgetStatement.md#budgetstatementdocument) | The BudgetStatement document to save. |
| `path` | `string` | The file path to save the document to. |

#### Returns

`Promise`<`string`\>

A promise that resolves with the saved file path.

#### Defined in

[budget-statement/custom/utils.ts:90](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/budget-statement/custom/utils.ts#L90)
