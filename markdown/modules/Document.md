[@acaldas/document-model-libs](../README.md) / [Exports](../modules.md) / Document

# Namespace: Document

This module exports all the public types, functions, and objects
from the document module. It provides an easy-to-use interface
for managing documents, and can be used in any Redux-based
application. This module exports:
- All action creators for the base document actions.
- The Document object, which is used to for creating and
manipulating documents in an object-oriented way.
- The baseReducer function, which is a reducer for managing
documents
- Various utility functions to be used by Document Models.

## Table of contents

### Namespaces

- [actions](Document.actions.md)
- [utils](Document.utils.md)

### Classes

- [BaseDocument](../classes/Document.BaseDocument.md)

### Type Aliases

- [Action](Document.md#action)
- [Attachment](Document.md#attachment)
- [Document](Document.md#document)
- [DocumentFile](Document.md#documentfile)
- [DocumentHeader](Document.md#documentheader)
- [FileRegistry](Document.md#fileregistry)
- [ImmutableReducer](Document.md#immutablereducer)
- [Operation](Document.md#operation)
- [Reducer](Document.md#reducer)

### Functions

- [applyMixins](Document.md#applymixins)
- [baseReducer](Document.md#basereducer)

## Type Aliases

### Action

Ƭ **Action**<`T`\>: `Object`

Defines the basic structure of an action.

#### Type parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `T` | `string` | The name of the action type. A `string` type by default. |

#### Type declaration

| Name | Type | Description |
| :------ | :------ | :------ |
| `input?` | `unknown` | The payload of the action. |
| `type` | `T` | The name of the action. |

#### Defined in

[document/types.ts:9](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/types.ts#L9)

___

### Attachment

Ƭ **Attachment**: \`attachment://${string}\`

String type representing an attachment in a Document.

**`Remarks`**

Attachment string is formatted as `attachment://<filename>`.

#### Defined in

[document/types.ts:126](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/types.ts#L126)

___

### Document

Ƭ **Document**<`Data`, `A`\>: [`DocumentHeader`](Document.md#documentheader) & { `data`: `Data` ; `fileRegistry`: [`FileRegistry`](Document.md#fileregistry) ; `initialState`: `Omit`<[`Document`](Document.md#document)<`Data`, `A`\>, ``"initialState"``\> ; `operations`: [`Operation`](Document.md#operation)<`A` \| `BaseAction`\>[]  }

The base type of a document model.

**`Remarks`**

This type is extended by all Document models.

#### Type parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `Data` | `unknown` | The type of the document data attribute. |
| `A` | extends [`Action`](Document.md#action) = [`Action`](Document.md#action) | The type of the actions supported by the Document. |

#### Defined in

[document/types.ts:106](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/types.ts#L106)

___

### DocumentFile

Ƭ **DocumentFile**: `Object`

The attributes stored for a file. Namely, attachments of a document.

#### Type declaration

| Name | Type | Description |
| :------ | :------ | :------ |
| `data` | `string` | The binary data of the attachment in Base64 |
| `extension?` | `string` | - |
| `fileName?` | `string` | - |
| `mimeType` | `string` | The MIME type of the attachment |

#### Defined in

[document/types.ts:76](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/types.ts#L76)

___

### DocumentHeader

Ƭ **DocumentHeader**: `Object`

The base attributes of a [Document](Document.md#document).

#### Type declaration

| Name | Type | Description |
| :------ | :------ | :------ |
| `created` | `string` | The timestamp of the creation date of the document. |
| `documentType` | `string` | The type of the document model. |
| `lastModified` | `string` | The timestamp of the last change in the document. |
| `name` | `string` | The name of the document. |
| `revision` | `number` | The number of operations applied to the document. |

#### Defined in

[document/types.ts:60](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/types.ts#L60)

___

### FileRegistry

Ƭ **FileRegistry**: `Record`<[`Attachment`](Document.md#attachment), [`DocumentFile`](Document.md#documentfile)\>

Object that indexes attachments of a Document.

**`Remarks`**

This is used to reduce memory usage to avoid
multiple instances of the binary data of the attachments.

#### Defined in

[document/types.ts:95](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/types.ts#L95)

___

### ImmutableReducer

Ƭ **ImmutableReducer**<`State`, `A`\>: (`state`: `WritableDraft`<[`Document`](Document.md#document)<`State`, `A`\>\>, `action`: `A`) => [`Document`](Document.md#document)<`State`, `A`\> \| `void`

#### Type parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `State` | `State` | The type of the document data. |
| `A` | extends [`Action`](Document.md#action) | The type of the actions supported by the reducer. |

#### Type declaration

▸ (`state`, `action`): [`Document`](Document.md#document)<`State`, `A`\> \| `void`

A [Reducer](Document.md#reducer) that prevents mutable code from changing the previous state.

**`Remarks`**

This reducer is wrapped with [Immer](https://immerjs.github.io/immer/).
This allows the reducer code to be mutable, making it simpler and
avoiding unintended changes in the provided state.
The returned state will always be a new object.

##### Parameters

| Name | Type |
| :------ | :------ |
| `state` | `WritableDraft`<[`Document`](Document.md#document)<`State`, `A`\>\> |
| `action` | `A` |

##### Returns

[`Document`](Document.md#document)<`State`, `A`\> \| `void`

#### Defined in

[document/types.ts:40](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/types.ts#L40)

___

### Operation

Ƭ **Operation**<`A`\>: `A` & { `index`: `number`  }

An operation that was applied to a [Document](Document.md#document).

**`Remarks`**

Wraps an action with an index, to be added to the operations history of a Document.
The `index` field is used to keep all operations in order and enable replaying the
document's history from the beginning.

#### Type parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `A` | extends [`Action`](Document.md#action) = [`Action`](Document.md#action) | The type of the action. |

#### Defined in

[document/types.ts:55](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/types.ts#L55)

___

### Reducer

Ƭ **Reducer**<`State`, `A`\>: (`state`: [`Document`](Document.md#document)<`State`, `A`\>, `action`: `A`) => [`Document`](Document.md#document)<`State`, `A`\>

#### Type parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `State` | `State` | The type of the document data. |
| `A` | extends [`Action`](Document.md#action) | The type of the actions supported by the reducer. |

#### Type declaration

▸ (`state`, `action`): [`Document`](Document.md#document)<`State`, `A`\>

A pure function that takes an action and the previous state
of the document and returns the new state.

##### Parameters

| Name | Type |
| :------ | :------ |
| `state` | [`Document`](Document.md#document)<`State`, `A`\> |
| `action` | `A` |

##### Returns

[`Document`](Document.md#document)<`State`, `A`\>

#### Defined in

[document/types.ts:23](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/types.ts#L23)

## Functions

### applyMixins

▸ **applyMixins**(`derivedCtor`, `constructors`): `void`

Applies multiple mixins to a base class.
Used to have separate mixins to group methods by actions.

**`Remarks`**

[https://www.typescriptlang.org/docs/handbook/mixins.html#alternative-pattern](https://www.typescriptlang.org/docs/handbook/mixins.html#alternative-pattern)

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `derivedCtor` | `any` | The class to apply the mixins to. |
| `constructors` | `any`[] | The constructors of the mixins. |

#### Returns

`void`

#### Defined in

[document/object.ts:183](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/object.ts#L183)

___

### baseReducer

▸ **baseReducer**<`T`, `A`\>(`state`, `action`, `customReducer`): [`Document`](Document.md#document)<`T`, `A`\>

Base document reducer that wraps a custom document reducer and handles
document-level actions such as undo, redo, prune, and set name.

#### Type parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `T` | `T` | The type of the state of the custom reducer. |
| `A` | extends [`Action`](Document.md#action)<`string`\> | The type of the actions of the custom reducer. |

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `state` | [`Document`](Document.md#document)<`T`, `A`\> | The current state of the document. |
| `action` | `BaseAction` \| `A` | The action object to apply to the state. |
| `customReducer` | [`ImmutableReducer`](Document.md#immutablereducer)<`T`, `A`\> | The custom reducer that implements the application logic specific to the document's state. |

#### Returns

[`Document`](Document.md#document)<`T`, `A`\>

The new state of the document.

#### Defined in

[document/reducer.ts:149](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/reducer.ts#L149)
