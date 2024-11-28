import {
    GraphQLError,
    GraphQLScalarType,
    GraphQLScalarTypeConfig,
    Kind,
} from 'graphql';
import { z } from 'zod';

export type ScalarType = {
    input: string;
    output: string;
};

export const type = 'string';

export const typedef = 'scalar URL';

export const schema = z.string().url();

export const stringSchema = 'z.string().url()';

const urlValidation = (value: unknown): string => {
    if (typeof value !== 'string') {
        throw new GraphQLError(
            `Value is not iso string: ${JSON.stringify(value)}`,
        );
    }

    const result = schema.safeParse(value);

    if (result.success) return result.data;
    throw new GraphQLError(result.error.message);
};

export const config: GraphQLScalarTypeConfig<string, string> = {
    name: 'URL',
    description: 'A custom scalar that represents a URL string',
    serialize: urlValidation,
    parseValue: urlValidation,
    parseLiteral: value => {
        if (value.kind !== Kind.STRING) {
            throw new GraphQLError('Value is not an string', { nodes: value });
        }

        return urlValidation(value.value);
    },
};

export const scalar = new GraphQLScalarType(config);
