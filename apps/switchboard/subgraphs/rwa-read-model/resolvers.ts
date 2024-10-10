import { getState } from './listener';

export const resolvers = {
    Query: {
        rwaPortfolio: () => {
            const state = getState();
            return {
                amountOfAccounts: state.amountOfAccounts,
            };
        },
    },
};
