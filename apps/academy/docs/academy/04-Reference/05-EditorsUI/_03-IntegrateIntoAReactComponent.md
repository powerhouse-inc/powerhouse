# Validate a scalar field in a React component

Use a built-in scalar's schema from `document-model/scalars` to validate an editor field. The input component comes from `@powerhousedao/document-engineering/ui`. This example validates an Ethereum address with `TextInput`.

## Create the input component

Read the built-in definition with `getCatalogScalar`. Its `schema` checks the input value. Pass the error messages to `TextInput` through its `errors` prop. Call the parent's `onChange` callback from the input's change handler, with the value and its validity.

```tsx
import { useState } from "react";
import { TextInput } from "@powerhousedao/document-engineering/ui";
import { getCatalogScalar } from "document-model/scalars";

const definition = getCatalogScalar("EthereumAddress");
if (!definition) {
  throw new Error("EthereumAddress is not available");
}
const schema = definition.schema;

type EthereumAddressProps = {
  onChange?: (address: string, isValidAddress: boolean) => void;
};

export function EthereumAddress({ onChange }: EthereumAddressProps) {
  const [address, setAddress] = useState("");
  const result = schema.safeParse(address);
  const errors =
    address === "" || result.success
      ? []
      : result.error.issues.map((issue) => issue.message);

  return (
    <TextInput
      id="eth-address-input"
      label="Ethereum address"
      value={address}
      placeholder="0x..."
      errors={errors}
      onChange={(event) => {
        const value = event.target.value;
        setAddress(value);
        onChange?.(value, schema.safeParse(value).success);
      }}
    />
  );
}
```

## Use a scalar from your package

For a scalar defined in your package's `scalars/index.ts`, import that definition and use its `schema.safeParse` in the same way. See [Custom scalars](/academy/Build/DocumentModelCreation/CustomScalars) for how to define and export it.

UI validation gives the user feedback. The host validates the scalars that packages define, and passes catalog scalars such as `EthereumAddress` through. See [What the host validates](/academy/Build/DocumentModelCreation/CustomScalars#what-the-host-validates).
