import { getState } from "./listener";

export const resolvers = {
    Query: {
        rwaPortfolio: async (_, { id }, ctx) => {
            const state = getState();
            return {
                amountOfAccounts: state.amountOfAccounts
            };
        }
    }
}