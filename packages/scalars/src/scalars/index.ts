import * as EmailAddress from './EmailAddress';

export { EmailAddress };

export const resolvers = {
    EmailAddress: EmailAddress.scalar,
};

export const typeDefs = [EmailAddress.typedef];
