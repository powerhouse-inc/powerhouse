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
];
