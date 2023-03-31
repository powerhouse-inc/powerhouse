[@acaldas/document-model-libs](../README.md) / [Exports](../modules.md) / [Document](Document.md) / actions

# Namespace: actions

[Document](Document.md).actions

## Table of contents

### Actions Functions

- [loadState](Document.actions.md#loadstate)
- [prune](Document.actions.md#prune)
- [redo](Document.actions.md#redo)
- [setName](Document.actions.md#setname)
- [undo](Document.actions.md#undo)

## Actions Functions

### loadState

▸ **loadState**(`state`, `operations`): `LoadStateAction`

Replaces the state of the document.

**`Remarks`**

This action shouldn't be used directly. It is dispatched by the [prune](Document.actions.md#prune) action.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `state` | `Pick`<[`Document`](Document.md#document)<`unknown`, [`Action`](Document.md#action)<`string`\>\>, ``"name"`` \| ``"data"``\> | State to be set in the document. |
| `operations` | `number` | Number of operations that were removed from the previous state. |

#### Returns

`LoadStateAction`

#### Defined in

[document/actions/creators.ts:65](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/actions/creators.ts#L65)

___

### prune

▸ **prune**(`start?`, `end?`): `PruneAction`

Joins multiple operations into a single [LOAD_STATE](Document.actions.md#loadstate) operation.

**`Remarks`**

Useful to keep operations history smaller. Operations to prune are selected by index,
similar to the [slice](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice) method in Arrays.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `start?` | `number` | Index of the first operation to prune |
| `end?` | `number` | Index of the last operation to prune |

#### Returns

`PruneAction`

#### Defined in

[document/actions/creators.ts:52](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/actions/creators.ts#L52)

___

### redo

▸ **redo**(`count?`): `RedoAction`

Cancels the last `count` [UNDO](Document.actions.md#undo) operations.

#### Parameters

| Name | Type | Default value | Description |
| :------ | :------ | :------ | :------ |
| `count` | `number` | `1` | Number of UNDO operations to cancel |

#### Returns

`RedoAction`

#### Defined in

[document/actions/creators.ts:39](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/actions/creators.ts#L39)

___

### setName

▸ **setName**(`name`): `SetNameAction`

Changes the name of the document.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `name` | `string` | The name to be set in the document. |

#### Returns

`SetNameAction`

#### Defined in

[document/actions/creators.ts:22](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/actions/creators.ts#L22)

___

### undo

▸ **undo**(`count?`): `UndoAction`

Cancels the last `count` operations.

#### Parameters

| Name | Type | Default value | Description |
| :------ | :------ | :------ | :------ |
| `count` | `number` | `1` | Number of operations to cancel |

#### Returns

`UndoAction`

#### Defined in

[document/actions/creators.ts:31](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/actions/creators.ts#L31)
