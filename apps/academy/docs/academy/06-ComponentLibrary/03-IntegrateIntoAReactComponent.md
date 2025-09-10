# Step 2: Integrate Your Scalar into a React Component

This guide explains how to use a custom scalar (created as described in the previous step) within a React component. You'll learn how to leverage the scalar's validation schema for form input, display errors, and ensure a seamless user experience.

## Table of Contents

- [Overview](#overview)
- [Step 1: Import the Scalar and Dependencies](#step-1-import-the-scalar-and-dependencies)
- [Step 2: Define Component Props](#step-2-define-component-props)
- [Step 3: Implement the Component](#step-3-implement-the-component)
- [Step 4: Render the Input and Error](#step-4-render-the-input-and-error)
- [Step 5: Example Usage](#step-5-example-usage)
- [Best Practices](#best-practices)
- [Tips](#tips)

## Overview

Custom scalars provide type-safe validation and parsing for your data. Integrating them into React components ensures that user input is validated consistently with your backend and schema definitions. This is especially useful for form fields like email, phone number, Ethereum address, etc.

## Step 1: Import the Scalar and Dependencies

Import your scalar and React hooks. You may use any input component to capture user input. In the following example, `FormInput` is used for demonstration purposes, but you can use a standard `<input>`, a custom component, or any UI library input.

```typescript
import { useState } from "react";
import { EthereumAddress as EthereumAddressScalar } from "@powerhousedao/document-engineering/graphql";
// FormInput is just an example. You can use any input component you prefer.
import { FormInput } from "@powerhousedao/design-system";
```

Replace `EthereumAddress` with your scalar's name as needed.

## Step 2: Define Component Props

Define the props for your component. Typically, you'll want an `onChange` callback to notify the parent of the value and its validity:

```typescript
export interface EthereumAddressProps {
  onChange?: (address: string, isValidAddress: boolean) => void;
}
```

Adapt the prop names and types to your scalar (e.g., `PhoneNumberProps`, `onChange(phone: string, isValid: boolean)`).

## Step 3: Implement the Component

Use React state to track the input value. Use the scalar's Zod schema for validation. Call `onChange` with the value and validity whenever the input changes.

> **Note:** The input component in this example is `FormInput`, but you can use any input or UI component to capture user input. The key is to validate the value using the scalar's schema.

```typescript
export const EthereumAddress: React.FC<EthereumAddressProps> = ({ onChange }) => {
  const [address, setAddress] = useState("");

  // Validate using the scalar's Zod schema
  const result = EthereumAddressScalar.schema.safeParse(address);
  const errors = result.error?.errors.map((error) => error.message).join(", ");

  // Notify parent of value and validity
  if (onChange) {
    onChange(address, result.success);
  }

  return (
    <div>
      {/* Replace FormInput with any input component you prefer */}
      <FormInput
        id="eth-address-input"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="0x...."
        aria-label="Ethereum address input"
      />
      <label htmlFor="eth-address-input">
        {address !== "" && errors}
      </label>
    </div>
  );
};
```

**Key Points:**

- Use the scalar's `.schema.safeParse(value)` for validation.
- Display error messages if validation fails.
- Call `onChange` with both the value and its validity.
- Use accessible labels and attributes.
- The input component is flexible—use what fits your UI best.

## Step 4: Render the Input and Error

- Use any form input component (e.g., `FormInput`, `<input>`, or a custom UI input) for the field.
- Show error messages below the input when validation fails.
- Add accessibility attributes (`aria-label`, `htmlFor`).

## Step 5: Example Usage

Here's how you might use your component in a parent form:

```typescript
<EthereumAddress
  onChange={(address, isValid) => {
    // Handle the address and its validity
    console.log("Address:", address, "Valid:", isValid);
  }}
/>
```

Replace `EthereumAddress` with your scalar component as needed.

## Best Practices

- **Validation:** Always use the scalar's schema for validation to ensure consistency with your backend.
- **Accessibility:** Use proper labels, `aria-*` attributes, and keyboard navigation.
- **Error Handling:** Display clear, user-friendly error messages.
- **DRY Principle:** Reuse the scalar's schema and avoid duplicating validation logic.
- **Type Safety:** Use TypeScript types for props and state.

## Tips

- Keep your UI clean and intuitive.
- Sync your component with any updates to the scalar's schema.
- Test edge cases (empty input, invalid formats, etc.).
- Use meaningful placeholder text and labels.
- Consider supporting additional props (e.g., `disabled`, `required`) for flexibility.
