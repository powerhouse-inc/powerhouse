# Powerhouse Scalars

This repository contains custom GraphQL scalars used by Powerhouse.

## Adding New Scalars

To add a new scalar to this repository, follow these steps:

1. **Create a New Scalar File**:

    - Navigate to the `src/scalars` directory.
    - Create a new file for your scalar, e.g., `MyScalar.ts`.

2. **Define the Scalar**:

    - Implement the scalar using the `GraphQLScalarType` from `graphql` library or custom logic.
    - Ensure you export this 4 objects from your new Scalar file:
        - `typedef`: This is the gql type definition `scalar MyScalar`
        - `schema`: The zod schema validation for your new scalar
        - `config`: The graphql config for your scalar (`GraphQLScalarTypeConfig` type)
        - `scalar`: The graphql scalar object (`GraphQLScalarTypeConfig` type)

    ```typescript
    import { GraphQLScalarType, GraphQLScalarTypeConfig, Kind } from 'graphql';
    import { z } from 'zod';

    export const typedef = 'scalar MyScalar';
    export const schema = z.string();
    export const config: GraphQLScalarTypeConfig<any, any> = {
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
    };

    export const scalar = new GraphQLScalarType(config);
    ```

3. **Update `src/scalars/index.ts`**:

    1. Create a new namespace import for your scalar file
    2. Include your scalar alias into the exported object
    3. Update the resolvers object and include your scalar
    4. Update the typeDefs array and inlcude your scalar typedef

    ```typescript
    import * as EmailAddress from './EmailAddress';
    import * as MyScalar from './MyScalar'; // 1.- namespace import

    export {
        EmailAddress,
        MyScalar, // 2.- Update exported object
    };

    export const resolvers = {
        EmailAddress: EmailAddress.scalar,
        MyScalar: MyScalar.scalar, // 3.- Update resolvers object
    };

    export const typeDefs = [
        EmailAddress.typedef,
        MyScalar.typedef, // 4.- Update typeDefs object
    ];
    ```

4. **Write Tests**:

    - Add tests for your new scalar to ensure it works as expected.
    - Place your tests in the `tests` directory.

5. **Update Documentation**:
    - Update this README with information about the new scalar.
    - Provide examples and usage instructions.
