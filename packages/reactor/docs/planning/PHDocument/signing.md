# Signing

Documents can exist as signed entities or unsigned. This information is carried on the document header.

## Unsigned Documents

By default, calling `createDocument` on a generated document will create an unsigned document. The `createDocument` function will call `createUnsignedHeader` to create the header with a UUID for the id.

## Signed Documents

A signed document may be created from an unsigned document by passing the header through `createSignedHeader`.

> This will effectively create a new document, as the id will be replaced with a signature.

```ts
const document = createDocument();

// initialize `IConnectCrypto` object -- this will load or generate a key pair
await connectCrypto.init();

// (alternatively, tests use a 'KeyPairSigner' class for now)
// const signer = new KeyPairSigner(connectCrypto.publicKey, connectCrypto.privateKey);

// sign the header
const signedDocument = await createSignedHeader(
  document.header,
  document.documentType,
  connectCrypto,
);

// document.header.id !== signedDocument.header.id
```
