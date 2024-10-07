# Powerhouse Scalars

This repository contains custom GraphQL scalars used by Powerhouse.

## Adding New Scalars

To add a new scalar to this repository, follow these steps:

1. **Create a New Scalar File**:

    - Navigate to the `src/scalars` directory.
    - Create a new file for your scalar, e.g., `MyScalar.ts`.

2. **Define the Scalar**:

    - Implement the scalar using the `GraphQLScalarType` from `graphql` library or custom logic.
    - Ensure you export the scalar properly.

    ```typescript
    import { GraphQLScalarType, Kind } from 'graphql';

    const MyScalar = new GraphQLScalarType({
        name: 'MyScalar',
        description: 'Description of MyScalar',
        serialize(value: any): any {
            // Implement serialization logic
        },
        parseValue(value: any): any {
            // Implement parsing logic
        },
        parseLiteral(ast: any): any {
            if (ast.kind === Kind.STRING) {
                // Implement literal parsing logic
            }
            return null;
        },
    });

    export default MyScalar;
    ```

3. **Update `src/scalars/index.ts`**:

    - Add a new export for your custom Scalar
    - Make sure to include your new Scalar into the `resolvers` object.

    ```typescript
    ...
    import { MyScalar } from './MyScalar';

    export * from './MyScalar';

    export const resolvers = {
        ...
        MyScalar: MyScalar,
    };

    ```

4. **Update the `src/typeDefs.ts` file**:

    - Create a Type definition for your new Scalar.
    - Include your Scalar type definition into the `typeDefs` array.

    ```typescript
    export const MyScalarTypeDefinition = 'scalar MyScalar';

    export const typeDefs = [..., MyScalarTypeDefinition];
    ```

5. **Write Tests**:

    - Add tests for your new scalar to ensure it works as expected.
    - Place your tests in the `tests` directory.

6. **Update Documentation**:
    - Update this README with information about the new scalar.
    - Provide examples and usage instructions.
