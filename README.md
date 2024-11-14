# Devcon 2024 Demo

- `pnpm i`
- `pnpm build`

In one terminal start Local Reactor to start listening to `ADD_POWT_LINE_ITEM` operations:

- `cd packages/reactor-local`
- `npx drizzle-kit push`
- `node dist/cli.js`

In another terminal start Connect and populate the reactor drive:

- `cd packages/document-model-libs
- `pnpm connect`
- Add remote drive `http://localhost:4001/d/powerhouse`
- `Create contributor bills on the Powerhouse remove drive (not on "My Local Drive") and add POWT line items

The graphQL query can be done at http://localhost:4001/contributor-bill-analyzer with:

```graphql
query POWtPerProject {
  powtComp {
    projectCode
    amount
  }
}
```

Once happy with the query data, Connect can be closed.

### Notes

If the Local Reactor db is reset, the remove drive in Connect has to be deleted and added again so they don't go out of sync.
A `clientStrandsError` event will be logged on the Connect console in the browser when this needs to be done.
The error is "Cannot read properties of undefined (reading 'getStrands')"
