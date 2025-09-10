# Step 1: Create Custom Scalars

This tutorial provides step-by-step instructions for creating custom scalars & components, and to contributing to the document-engineering project.
The github repo for the Document-Engineering can be found [here](https://github.com/powerhouse-inc/document-engineering/tree/main)

### Creating New GraphQL Scalars

GraphQL scalars are custom data types that define how data is validated, serialized, and parsed. This guide will walk you through creating a new scalar in the `src/scalars/graphql/` directory.

## Step 1: Create the Scalar File

Create a new TypeScript file in `src/scalars/graphql/` for your scalar. Use `EmailAddress.ts` as a reference.

**Example: Creating a `PhoneNumber.ts` scalar**

```typescript
import {
  GraphQLError,
  GraphQLScalarType,
  type GraphQLScalarTypeConfig,
  Kind,
} from "graphql";
import { z } from "zod";

export interface ScalarType {
  input: string;
  output: string;
}

export const type = "string"; // TS type in string form

export const typedef = "scalar PhoneNumber";

export const schema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format");

export const stringSchema =
  'z.string().regex(/^\\+?[1-9]\\d{1,14}$/, "Invalid phone number format")';

const phoneValidation = (value: unknown): string => {
  if (typeof value !== "string") {
    throw new GraphQLError(`Value is not string: ${JSON.stringify(value)}`);
  }

  const result = schema.safeParse(value);

  if (result.success) return result.data;
  throw new GraphQLError(result.error.message);
};

export const config: GraphQLScalarTypeConfig<string, string> = {
  name: "PhoneNumber",
  description:
    "A field whose value conforms to international phone number format.",
  serialize: phoneValidation,
  parseValue: phoneValidation,
  parseLiteral: (value) => {
    if (value.kind !== Kind.STRING) {
      throw new GraphQLError(
        `Can only validate strings as phone numbers but got a: ${value.kind}`,
        { nodes: value },
      );
    }

    return phoneValidation(value.value);
  },
};

export const scalar = new GraphQLScalarType(config);
```

### Key Components to Update:

1. **`type`**: The TypeScript type (usually `'string'` for text-based scalars)
2. **`typedef`**: The GraphQL type definition (e.g., `'scalar PhoneNumber'`)
3. **`schema`**: Zod validation schema for your data type
4. **`stringSchema`**: String representation of the zod schema (used for code generation)
5. **Validation function**: Custom validation logic for your scalar
6. **`config.name`**: The name of your scalar (must match the typedef)
7. **`config.description`**: Human-readable description of the scalar

## Step 2: Register the Scalar in `scalars.ts`

After creating your scalar file, you need to register it in `src/scalars/graphql/scalars.ts`. This involves updating multiple sections of the file.
The github repo for the Document-Engineering can be found [here](https://github.com/powerhouse-inc/document-engineering/tree/main)

### 2.1 Add Namespace Import

Add your scalar to the namespace imports section (around line 2):

```typescript
// namespace imports -- DO NOT REMOVE OR EDIT THIS COMMENT
import * as Amount from "./Amount.js";
import * as AmountCrypto from "./AmountCrypto.js";
// ... other imports ...
import * as PhoneNumber from "./PhoneNumber.js"; // ADD THIS LINE
import * as URLScalar from "./URL.js";
```

### 2.2 Add Type Export

Add the type export (around line 22):

```typescript
// export types -- DO NOT REMOVE OR EDIT THIS COMMENT
export type { ScalarType as AmountScalarType } from "./Amount.js";
// ... other type exports ...
export type { ScalarType as PhoneNumberScalarType } from "./PhoneNumber.js"; // ADD THIS LINE
export type { ScalarType as URLScalarType } from "./URL.js";
```

### 2.3 Add to Export Object

Add your scalar to the main export object (around line 40):

```typescript
export {
  Amount,
  AmountCrypto,
  // ... other exports ...
  PhoneNumber, // ADD THIS LINE
  URLScalar,
};
```

### 2.4 Add to Custom Scalars

Add your scalar to the `customScalars` object (around line 54):

```typescript
export const customScalars: Record<string, BasePHScalar<any>> = {
  // ... other scalars ...
  PhoneNumber, // ADD THIS LINE
  URLScalar,
} as const;
```

#### 2.5 Add to Resolvers

Add your scalar to the `resolvers` object (around line 74):

```typescript
export const resolvers = {
  // export resolvers -- DO NOT REMOVE OR EDIT THIS COMMENT
  AmountTokens: AmountTokens.scalar,
  // ... other resolvers ...
  PhoneNumber: PhoneNumber.scalar, // ADD THIS LINE
  Amount: Amount.scalar,
};
```

### 2.6 Add to Type Definitions

Add your typedef to the `typeDefs` array (around line 90):

```typescript
export const typeDefs = [
  // export typedefs -- DO NOT REMOVE OR EDIT THIS COMMENT
  AmountTokens.typedef,
  // ... other typedefs ...
  PhoneNumber.typedef, // ADD THIS LINE
  Amount.typedef,
];
```

### 2.7 Add to Generator Type Definitions

Add your scalar to the `generatorTypeDefs` object (around line 105):

```typescript
export const generatorTypeDefs = {
  // export generator typedefs -- DO NOT REMOVE OR EDIT THIS COMMENT
  [AmountTokens.config.name]: AmountTokens.type,
  // ... other entries ...
  [PhoneNumber.config.name]: PhoneNumber.type, // ADD THIS LINE
  [Amount.config.name]: Amount.type,
};
```

### 2.8 Add to Validation Schema

Add your scalar to the `validationSchema` object (around line 120):

```typescript
export const validationSchema = {
  // export validation schema -- DO NOT REMOVE OR EDIT THIS COMMENT
  [AmountTokens.config.name]: AmountTokens.stringSchema,
  // ... other entries ...
  [PhoneNumber.config.name]: PhoneNumber.stringSchema, // ADD THIS LINE
  [Amount.config.name]: Amount.stringSchema,
};
```

## Step 3: Create Tests for Your Scalar

Every scalar must have comprehensive tests to ensure it works correctly. Create a test file in `src/scalars/graphql/test/` following the naming convention `YourScalar.test.ts`.

**Example: Creating `PhoneNumber.test.ts`**

```typescript
import { Kind } from "graphql";
import { scalar } from "../PhoneNumber.js";

describe("PhoneNumber Scalar", () => {
  it("should serialize a phone number", () => {
    const phoneNumber = "+1234567890";

    expect(scalar.serialize(phoneNumber)).toBe(phoneNumber);
  });

  it("should throw an error if the value is not a string", () => {
    const phoneNumber = 123;

    expect(() => scalar.serialize(phoneNumber)).toThrow();
  });

  it("should throw an error if the value is not a valid phone number", () => {
    const phoneNumber = "invalid-phone";

    expect(() => scalar.serialize(phoneNumber)).toThrow();
  });

  it("should parse a valid phone number", () => {
    const phoneNumber = "+1234567890";

    expect(scalar.parseValue(phoneNumber)).toBe(phoneNumber);
  });

  it("should throw an error if parse a value that is not a valid phone number", () => {
    const phoneNumber = "invalid-phone";

    expect(() => scalar.parseValue(phoneNumber)).toThrow();
  });

  it("should throw an error if parse a value that is not a string", () => {
    const phoneNumber = 123;

    expect(() => scalar.parseValue(phoneNumber)).toThrow();
  });

  it("should parse a valid phone number from a literal", () => {
    const phoneNumber = "+1234567890";

    expect(
      scalar.parseLiteral({
        kind: Kind.STRING,
        value: phoneNumber,
      }),
    ).toBe(phoneNumber);
  });

  it("should throw an error if parse a literal that is not a valid phone number", () => {
    const phoneNumber = "invalid-phone";

    expect(() =>
      scalar.parseLiteral({
        kind: Kind.STRING,
        value: phoneNumber,
      }),
    ).toThrow();
  });

  it("should throw an error if parse a literal that is not a string", () => {
    const phoneNumber = "+1234567890";

    expect(() =>
      scalar.parseLiteral({
        kind: Kind.INT,
        value: phoneNumber,
      }),
    ).toThrow();
  });
});
```

#### Required Test Cases

Your scalar tests should cover these essential scenarios:

##### Serialization Tests

- ✅ **Valid values**: Test that valid inputs are serialized correctly
- ❌ **Invalid types**: Test that non-string inputs throw errors
- ❌ **Invalid format**: Test that strings not matching your validation throw errors

##### Parse Value Tests

- ✅ **Valid values**: Test that valid inputs are parsed correctly
- ❌ **Invalid format**: Test that invalid strings throw errors
- ❌ **Invalid types**: Test that non-string inputs throw errors

##### Parse Literal Tests

- ✅ **Valid STRING literals**: Test that valid string literals are parsed correctly
- ❌ **Invalid STRING literals**: Test that invalid string literals throw errors
- ❌ **Non-STRING literals**: Test that non-string literal kinds (INT, FLOAT, etc.) throw errors

#### Testing Best Practices

1. **Test edge cases**: Include boundary values and common invalid inputs
2. **Test multiple valid formats**: If your scalar accepts different valid formats, test them all
3. **Use descriptive test names**: Make it clear what each test is validating
4. **Follow the naming convention**: `YourScalar.test.ts` in the `test/` directory

#### Example Edge Cases for Different Scalar Types

**String-based scalars (like PhoneNumber):**

```typescript
// Test empty string
expect(() => scalar.parseValue("")).toThrow();

// Test too long/short values
expect(() => scalar.parseValue("123")).toThrow();
expect(() => scalar.parseValue("+" + "1".repeat(20))).toThrow();

// Test special characters
expect(() => scalar.parseValue("+1-234-567-890")).not.toThrow();
```

**Number-based scalars:**

```typescript
// Test zero
expect(scalar.parseValue(0)).toBe(0);

// Test negative numbers
expect(() => scalar.parseValue(-1)).toThrow();

// Test decimal numbers
expect(scalar.parseValue(123.45)).toBe(123.45);
```

**Date-based scalars:**

```typescript
// Test valid ISO date
expect(scalar.parseValue("2023-12-25T00:00:00Z")).toBe("2023-12-25T00:00:00Z");

// Test invalid date format
expect(() => scalar.parseValue("25/12/2023")).toThrow();
```

## Step 4: Validate Your Implementation

After implementing your scalar and tests, make sure to:

1. **Run the tests** to ensure they all pass
2. **Build the project** to ensure there are no TypeScript errors
3. **Test GraphQL queries** that use your new scalar
4. **Verify code generation** works with your new scalar

### Common Scalar Types

Here are some common patterns for different types of scalars:

#### String-based Scalars

```typescript
export const type = "string";
export const schema = z.string().min(1).max(100);
```

#### Number-based Scalars

```typescript
export const type = "number";
export const schema = z.number().positive();
```

#### Date-based Scalars

```typescript
export const type = "string";
export const schema = z.string().datetime();
```

:::info
**Contributing and UI for Scalars**

- **Open Source**: Please submit contributions as a pull request to the Powerhouse team.
- **UI is Optional but Helpful**: A design or UI for your scalar isn't required, but it helps reviewers understand its purpose.
- **Semantic Scalars**: Some scalars don't need a unique UI. For instance, `Title` and `Description` might both use a simple text input but serve a semantic role by adding specific meaning and validation to the schema.
  :::

### Tips

- Always follow the naming convention: use PascalCase for scalar names
- Include meaningful validation in your Zod schema
- Write clear, descriptive error messages
- Keep the `stringSchema` in sync with your `schema` definition
- Test edge cases in your validation function
- Update all required sections in `scalars.ts`
