import {
    GraphQLError,
    GraphQLScalarType,
    GraphQLScalarTypeConfig,
    Kind,
} from 'graphql';
import { z } from 'zod';

export const emailSchema = z.string().email();

const emailValidation = (value: unknown): string => {
    if (typeof value !== 'string') {
        throw new GraphQLError(`Value is not string: ${JSON.stringify(value)}`);
    }

    const result = emailSchema.safeParse(value);

    if (result.success) return result.data;
    throw new GraphQLError(result.error.message);
};

export const GraphQLEmailAddressConfig: GraphQLScalarTypeConfig<
    string,
    string
> = {
    name: 'EmailAddress',
    description:
        'A field whose value conforms to the standard internet email address format as specified in RFC822: https://www.w3.org/Protocols/rfc822/.',
    serialize: emailValidation,
    parseValue: emailValidation,
    parseLiteral: value => {
        if (value.kind !== Kind.STRING) {
            throw new GraphQLError(
                `Can only validate strings as email addresses but got a: ${value.kind}`,
                { nodes: value },
            );
        }

        return emailValidation(value.value);
    },
};

export const GraphQLEmailAddress = new GraphQLScalarType(
    GraphQLEmailAddressConfig,
);
