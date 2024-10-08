import { getState } from "./listener";

export const resolvers = {
    Query: {
        rwaPortfolio: async () => {
            const state = getState();
            return {
                amountOfAccounts: state.amountOfAccounts
            };
        }
    }
}