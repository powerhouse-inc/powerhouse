// namespace imports -- DO NOT REMOVE OR EDIT THIS COMMENT
import * as AmountPercentage from './AmountPercentage';
import * as EmailAddress from './EmailAddress';

// export types -- DO NOT REMOVE OR EDIT THIS COMMENT
export type { ScalarType as AmountPercentageScalarType } from './AmountPercentage';
export type { ScalarType as EmailAddressScalarType } from './EmailAddress';

export {
    // export object -- DO NOT REMOVE OR EDIT THIS COMMENT
    AmountPercentage,
    EmailAddress,
};

export const resolvers = {
    // export resolvers -- DO NOT REMOVE OR EDIT THIS COMMENT
    AmountPercentage: AmountPercentage.scalar,
    EmailAddress: EmailAddress.scalar,
};

export const typeDefs = [
    // export typedefs -- DO NOT REMOVE OR EDIT THIS COMMENT
    AmountPercentage.typedef,
    EmailAddress.typedef,
    'scalar Date',
    'scalar DateTime',
    'scalar URL',
    'scalar Amount_Money',
    'scalar OLabel',
    'scalar Currency',
    'scalar PHID',
    'scalar OID',
];

export const generatorTypeDefs = {
    // export generator typedefs -- DO NOT REMOVE OR EDIT THIS COMMENT
    [EmailAddress.config.name]: EmailAddress.type,
    [AmountPercentage.config.name]: AmountPercentage.type,
    Date: 'string',
    DateTime: 'string',
    URL: 'string',
    Amount_Money: 'number',
    OLabel: 'string',
    Currency: 'string',
    PHID: 'string',
    OID: 'string',
};

export const validationSchema = {
    // export validation schema -- DO NOT REMOVE OR EDIT THIS COMMENT
    [EmailAddress.config.name]: EmailAddress.stringSchema,
    [AmountPercentage.config.name]: AmountPercentage.stringSchema,
    Date: 'z.string()',
    DateTime: 'z.string()',
    URL: 'z.string()',
    Amount_Money: 'z.number()',
    OLabel: 'z.string()',
    Currency: 'z.string()',
    PHID: 'z.string()',
    OID: 'z.string()',
};
