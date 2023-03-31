[@acaldas/document-model-libs](../README.md) / [Exports](../modules.md) / [Document](../modules/Document.md) / BaseDocument

# Class: BaseDocument<T, A\>

[Document](../modules/Document.md).BaseDocument

This is an abstract class representing a document and provides methods
for creating and manipulating documents.

**`Typeparam`**

T - The type of data stored in the document.

**`Typeparam`**

A - The type of action the document can take.

## Type parameters

| Name | Type |
| :------ | :------ |
| `T` | `T` |
| `A` | extends [`Action`](../modules/Document.md#action) |

## Hierarchy

- **`BaseDocument`**

  ↳ [`BudgetStatement`](BudgetStatement.BudgetStatement.md)

## Table of contents

### Constructors

- [constructor](Document.BaseDocument.md#constructor)

### Properties

- [reducer](Document.BaseDocument.md#reducer)
- [state](Document.BaseDocument.md#state)

### Accessors

- [created](Document.BaseDocument.md#created)
- [documentType](Document.BaseDocument.md#documenttype)
- [initialState](Document.BaseDocument.md#initialstate)
- [lastModified](Document.BaseDocument.md#lastmodified)
- [name](Document.BaseDocument.md#name)
- [operations](Document.BaseDocument.md#operations)
- [revision](Document.BaseDocument.md#revision)

### Methods

- [dispatch](Document.BaseDocument.md#dispatch)
- [getAttachment](Document.BaseDocument.md#getattachment)
- [loadFromFile](Document.BaseDocument.md#loadfromfile)
- [loadState](Document.BaseDocument.md#loadstate)
- [prune](Document.BaseDocument.md#prune)
- [redo](Document.BaseDocument.md#redo)
- [saveToFile](Document.BaseDocument.md#savetofile)
- [setName](Document.BaseDocument.md#setname)
- [undo](Document.BaseDocument.md#undo)
- [stateFromFile](Document.BaseDocument.md#statefromfile)

## Constructors

### constructor

• **new BaseDocument**<`T`, `A`\>(`reducer`, `initialState?`)

Constructs a BaseDocument instance with an initial state.

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | `T` |
| `A` | extends [`Action`](../modules/Document.md#action)<`string`\> |

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `reducer` | [`Reducer`](../modules/Document.md#reducer)<`T`, `BaseAction` \| `A`\> | The reducer function that updates the state. |
| `initialState?` | `Partial`<[`Document`](../modules/Document.md#document)<`T`, `A`\>\> & { `data`: `T`  } | The initial state of the document. |

#### Defined in

[document/object.ts:21](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/object.ts#L21)

## Properties

### reducer

• `Private` **reducer**: [`Reducer`](../modules/Document.md#reducer)<`T`, `BaseAction` \| `A`\>

#### Defined in

[document/object.ts:14](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/object.ts#L14)

___

### state

• `Protected` **state**: [`Document`](../modules/Document.md#document)<`T`, `A`\>

#### Defined in

[document/object.ts:13](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/object.ts#L13)

## Accessors

### created

• `get` **created**(): `string`

Gets the timestamp of the date the document was created.

#### Returns

`string`

#### Defined in

[document/object.ts:88](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/object.ts#L88)

___

### documentType

• `get` **documentType**(): `string`

Gets the type of document.

#### Returns

`string`

#### Defined in

[document/object.ts:81](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/object.ts#L81)

___

### initialState

• `get` **initialState**(): `Omit`<[`Document`](../modules/Document.md#document)<`T`, `A`\>, ``"initialState"``\>

Gets the initial state of the document.

#### Returns

`Omit`<[`Document`](../modules/Document.md#document)<`T`, `A`\>, ``"initialState"``\>

#### Defined in

[document/object.ts:109](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/object.ts#L109)

___

### lastModified

• `get` **lastModified**(): `string`

Gets the timestamp of the date the document was last modified.

#### Returns

`string`

#### Defined in

[document/object.ts:95](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/object.ts#L95)

___

### name

• `get` **name**(): `string`

Gets the name of the document.

#### Returns

`string`

#### Defined in

[document/object.ts:74](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/object.ts#L74)

___

### operations

• `get` **operations**(): [`Operation`](../modules/Document.md#operation)<`BaseAction` \| `A`\>[]

Gets the list of operations performed on the document.

#### Returns

[`Operation`](../modules/Document.md#operation)<`BaseAction` \| `A`\>[]

#### Defined in

[document/object.ts:116](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/object.ts#L116)

___

### revision

• `get` **revision**(): `number`

Gets the revision number of the document.

#### Returns

`number`

#### Defined in

[document/object.ts:102](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/object.ts#L102)

## Methods

### dispatch

▸ `Protected` **dispatch**(`action`): [`BaseDocument`](Document.BaseDocument.md)<`T`, `A`\>

Dispatches an action to update the state of the document.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `action` | `BaseAction` \| `A` | The action to dispatch. |

#### Returns

[`BaseDocument`](Document.BaseDocument.md)<`T`, `A`\>

The Document instance.

#### Defined in

[document/object.ts:34](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/object.ts#L34)

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

#### Defined in

[document/object.ts:124](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/object.ts#L124)

___

### loadFromFile

▸ **loadFromFile**(`path`): `Promise`<`void`\>

Loads the state of the document from a file.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `path` | `string` | The file path where the state is stored. |

#### Returns

`Promise`<`void`\>

#### Defined in

[document/object.ts:53](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/object.ts#L53)

___

### loadState

▸ **loadState**(`state`, `operations`): `void`

Loads a document state and a set of operations.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `state` | `Pick`<[`Document`](../modules/Document.md#document)<`T`, `A`\>, ``"name"`` \| ``"data"``\> | The state to load. |
| `operations` | `number` | The operations to apply to the document. |

#### Returns

`void`

#### Defined in

[document/object.ts:165](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/object.ts#L165)

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

#### Defined in

[document/object.ts:156](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/object.ts#L156)

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

#### Defined in

[document/object.ts:148](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/object.ts#L148)

___

### saveToFile

▸ `Protected` **saveToFile**(`path`, `extension`): `Promise`<`string`\>

Saves the state of the document to a file.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `path` | `string` | The file path where the state should be saved. |
| `extension` | `string` | The file extension to use when saving the state. |

#### Returns

`Promise`<`string`\>

The file path where the state was saved.

#### Defined in

[document/object.ts:45](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/object.ts#L45)

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

#### Defined in

[document/object.ts:132](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/object.ts#L132)

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

#### Defined in

[document/object.ts:140](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/object.ts#L140)

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

#### Defined in

[document/object.ts:63](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/object.ts#L63)
