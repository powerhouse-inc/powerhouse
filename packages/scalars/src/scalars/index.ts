// namespace imports -- DO NOT REMOVE OR EDIT THIS COMMENT
import * as EmailAddress from './EmailAddress';
import * as AmountPercentage from './AmountPercentage';

// export types -- DO NOT REMOVE OR EDIT THIS COMMENT
export type { ScalarType as EmailAddressScalarType } from './EmailAddress';

export {
    // export object -- DO NOT REMOVE OR EDIT THIS COMMENT
    EmailAddress,
    AmountPercentage,
};

export const resolvers = {
    // export resolvers -- DO NOT REMOVE OR EDIT THIS COMMENT
    EmailAddress: EmailAddress.scalar,
    AmountPercentage: AmountPercentage.scalar,
};

export const typeDefs = [
    // export typedefs -- DO NOT REMOVE OR EDIT THIS COMMENT
    EmailAddress.typedef,
    AmountPercentage.typedef,
];

export const generatorTypeDefs = {
    // export generator typedefs -- DO NOT REMOVE OR EDIT THIS COMMENT
    [EmailAddress.config.name]: EmailAddress.type,
    [AmountPercentage.config.name]: AmountPercentage.type,
};

export const validationSchema = {
    // export validation schema -- DO NOT REMOVE OR EDIT THIS COMMENT
    [EmailAddress.config.name]: EmailAddress.stringSchema,
    [AmountPercentage.config.name]: AmountPercentage.stringSchema,
};
