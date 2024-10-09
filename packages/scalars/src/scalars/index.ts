// namespace imports -- DO NOT REMOVE OR EDIT THIS COMMENT
import * as EmailAddress from './EmailAddress';

// export types -- DO NOT REMOVE OR EDIT THIS COMMENT
export type { ScalarType as EmailAddressScalarType } from './EmailAddress';

export {
    // export object -- DO NOT REMOVE OR EDIT THIS COMMENT
    EmailAddress,
};

export const resolvers = {
    // export resolvers -- DO NOT REMOVE OR EDIT THIS COMMENT
    EmailAddress: EmailAddress.scalar,
};

export const typeDefs = [
    // export typedefs -- DO NOT REMOVE OR EDIT THIS COMMENT
    EmailAddress.typedef,
];
