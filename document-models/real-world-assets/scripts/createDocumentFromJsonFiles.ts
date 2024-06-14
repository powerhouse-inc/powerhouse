// import { reducer, utils } from '..';
// import operations from './operations.json';

// const initialState = {
//     accounts: [
//         {
//             id: 'principal-lender-account-id',
//             reference: '0x',
//             label: 'Principal Lender',
//         },
//     ],
//     principalLenderAccountId: 'principal-lender-account-id',
//     spvs: [],
//     serviceProviderFeeTypes: [
//         {
//             id: 'principal-fee-type-id',
//             name: 'Principal',
//             feeType: 'Principal',
//             accountId: 'principal-lender-account-id',
//         },
//     ],
//     fixedIncomeTypes: [],
//     portfolio: [
//         {
//             id: 'principal-asset-id',
//             type: 'Cash',
//             spvId: '1',
//             currency: 'USD',
//             balance: 0,
//         },
//     ],
//     transactions: [],
// };

// let document = utils.createDocument({
//     state: {
//         global: initialState,
//         local: {},
//     },
// });

// for (const operation of operations.global) {
//     document = reducer(document, operation);
// }

// utils.saveToFile(document, './', 'output');
