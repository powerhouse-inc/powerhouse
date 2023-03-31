[@acaldas/document-model-libs](../README.md) / [Exports](../modules.md) / [Document](Document.md) / utils

# Namespace: utils

[Document](Document.md).utils

## Table of contents

### Functions

- [createAction](Document.utils.md#createaction)
- [createDocument](Document.utils.md#createdocument)
- [createReducer](Document.utils.md#createreducer)
- [getLocalFile](Document.utils.md#getlocalfile)
- [getRemoteFile](Document.utils.md#getremotefile)
- [hashAttachment](Document.utils.md#hashattachment)
- [loadFromFile](Document.utils.md#loadfromfile)
- [saveToFile](Document.utils.md#savetofile)

## Functions

### createAction

▸ **createAction**<`A`\>(`type`, `input?`): `A`

Helper function to be used by action creators.

**`Remarks`**

Creates an action with the given type and input properties. The input
properties default to an empty object.

**`Throws`**

Error if the type is empty or not a string.

#### Type parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `A` | extends [`Action`](Document.md#action)<`string`\> | Type of the action to be returned. |

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `type` | `A`[``"type"``] | The type of the action. |
| `input` | `A`[``"input"``] | The input properties of the action. |

#### Returns

`A`

The new action.

#### Defined in

[document/utils/base.ts:22](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/utils/base.ts#L22)

___

### createDocument

▸ **createDocument**<`T`, `A`\>(`initialState?`): [`Document`](Document.md#document)<`T`, `A`\>

Builds the initial document state from the provided data.

#### Type parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `T` | `T` | The type of the data. |
| `A` | extends [`Action`](Document.md#action)<`string`\> | The type of the actions. |

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `initialState?` | `Partial`<[`Document`](Document.md#document)<`T`, `A`\>\> & { `data`: `T`  } | The initial state of the document. The `data` property is required, but all other properties are optional. |

#### Returns

[`Document`](Document.md#document)<`T`, `A`\>

The new document state.

#### Defined in

[document/utils/base.ts:93](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/utils/base.ts#L93)

___

### createReducer

▸ **createReducer**<`T`, `A`\>(`reducer`, `documentReducer?`): (`state`: [`Document`](Document.md#document)<`T`, `BaseAction` \| `A`\>, `action`: `BaseAction` \| `A`) => [`Document`](Document.md#document)<`T`, `A`\>

Helper function to create a document model reducer.

**`Remarks`**

This function creates a new reducer that wraps the provided `reducer` with
`documentReducer`, adding support for document actions:
  - `SET_NAME`
  - `UNDO`
  - `REDO`
  - `PRUNE`

It also updates the document-related attributes on every operation.

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | `unknown` |
| `A` | extends [`Action`](Document.md#action)<`string`\> = [`Action`](Document.md#action)<`string`\> |

#### Parameters

| Name | Type | Default value | Description |
| :------ | :------ | :------ | :------ |
| `reducer` | [`ImmutableReducer`](Document.md#immutablereducer)<`T`, `A`\> | `undefined` | The custom reducer to wrap. |
| `documentReducer` | <T, A\>(`state`: [`Document`](Document.md#document)<`T`, `A`\>, `action`: `BaseAction` \| `A`, `customReducer`: [`ImmutableReducer`](Document.md#immutablereducer)<`T`, `A`\>) => [`Document`](Document.md#document)<`T`, `A`\> | `baseReducer` | Base document reducer that wraps a custom document reducer and handles document-level actions such as undo, redo, prune, and set name. |

#### Returns

`fn`

The new reducer.

▸ (`state`, `action`): [`Document`](Document.md#document)<`T`, `A`\>

##### Parameters

| Name | Type |
| :------ | :------ |
| `state` | [`Document`](Document.md#document)<`T`, `BaseAction` \| `A`\> |
| `action` | `BaseAction` \| `A` |

##### Returns

[`Document`](Document.md#document)<`T`, `A`\>

#### Defined in

[document/utils/base.ts:55](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/utils/base.ts#L55)

___

### getLocalFile

▸ **getLocalFile**(`path`): `Promise`<[`DocumentFile`](Document.md#documentfile)\>

Reads an attachment from a file and returns its base64-encoded data and MIME type.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `path` | `string` | The path of the attachment file to read. |

#### Returns

`Promise`<[`DocumentFile`](Document.md#documentfile)\>

A Promise that resolves to an object containing the base64-encoded data and MIME type of the attachment.

#### Defined in

[document/utils/file.ts:123](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/utils/file.ts#L123)

___

### getRemoteFile

▸ **getRemoteFile**(`url`): `Promise`<[`DocumentFile`](Document.md#documentfile)\>

Fetches an attachment from a URL and returns its base64-encoded data and MIME type.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `url` | `string` | The URL of the attachment to fetch. |

#### Returns

`Promise`<[`DocumentFile`](Document.md#documentfile)\>

A Promise that resolves to an object containing the base64-encoded data and MIME type of the attachment.

#### Defined in

[document/utils/file.ts:106](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/utils/file.ts#L106)

___

### hashAttachment

▸ **hashAttachment**(`data`): `string`

Returns the SHA1 hash of the given attachment data.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `data` | `string` | The base64-encoded data of the attachment to hash. |

#### Returns

`string`

The hash of the attachment data.

#### Defined in

[document/utils/file.ts:135](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/utils/file.ts#L135)

___

### loadFromFile

▸ **loadFromFile**<`S`, `A`\>(`path`, `reducer`): `Promise`<[`Document`](Document.md#document)<`S`, `BaseAction` \| `A`\>\>

Loads a document from a ZIP file.

**`Remarks`**

This function reads a ZIP file and returns the document state after
applying all the operations. The reducer is used to apply the operations.

**`Throws`**

An error if the initial state or the operations history is not found in the ZIP file.

#### Type parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `S` | `S` | The type of the state object. |
| `A` | extends [`Action`](Document.md#action)<`string`\> | The type of the actions that can be applied to the state object. |

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `path` | `string` | The path to the ZIP file. |
| `reducer` | [`Reducer`](Document.md#reducer)<`S`, `BaseAction` \| `A`\> | The reducer to apply the operations to the state object. |

#### Returns

`Promise`<[`Document`](Document.md#document)<`S`, `BaseAction` \| `A`\>\>

A promise that resolves to the document state after applying all the operations.

#### Defined in

[document/utils/file.ts:61](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/utils/file.ts#L61)

___

### saveToFile

▸ **saveToFile**(`document`, `path`, `extension`): `Promise`<`string`\>

Saves a document to a ZIP file.

**`Remarks`**

This function creates a ZIP file containing the document's state, operations,
and file attachments. The file is saved to the specified path.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `document` | [`Document`](Document.md#document)<`unknown`, [`Action`](Document.md#action)<`string`\>\> | The document to save to the file. |
| `path` | `string` | The path to save the file to. |
| `extension` | `string` | The extension to use for the file. |

#### Returns

`Promise`<`string`\>

A promise that resolves to the path of the saved file.

#### Defined in

[document/utils/file.ts:19](https://github.com/acaldas/document-model-libs/blob/4ee6940/src/document/utils/file.ts#L19)
