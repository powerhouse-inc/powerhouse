// import { copy } from 'copy-anything';
// import { Cash, calculateTotalFees, isCashAsset, reducer, utils } from '..';
// import operations from './operations-original.json';

// main();

// async function main() {
//     let document = utils.createDocument();
//     for (const operation of operations.global) {
//         const oldCashAsset = copy(
//             document.state.global.portfolio.find(a => isCashAsset(a)) as Cash,
//         );

//         const oldTransaction = copy(
//             document.state.global.transactions.find(
//                 tx => tx.id === operation.input.id,
//             ),
//         );

//         document = reducer(document, operation);

//         const newCashAsset = copy(
//             document.state.global.portfolio.find(a => isCashAsset(a)) as Cash,
//         );

//         const newTransaction = copy(
//             document.state.global.transactions.find(
//                 tx => tx.id === operation.input.id,
//             ),
//         );

//         if (operation.type === 'CREATE_GROUP_TRANSACTION') {
//             console.table({
//                 'Operation type': 'CREATE_GROUP_TRANSACTION',
//                 ID: newTransaction?.id,
//                 'Transaction type': newTransaction?.type,
//                 'Cash amount': newTransaction?.cashTransaction?.amount,
//                 'Total fees': calculateTotalFees(newTransaction?.fees),
//                 'Cash balance change': newTransaction?.cashBalanceChange,
//                 'Old cash balance': oldCashAsset?.balance,
//                 'New cash balance': newCashAsset?.balance,
//             });
//         }

//         if (operation.type === 'EDIT_GROUP_TRANSACTION') {
//             console.table({
//                 'Operation type': 'EDIT_GROUP_TRANSACTION',
//                 ID: newTransaction?.id,
//                 'Old transaction type': oldTransaction?.type,
//                 'New transaction type': newTransaction?.type,
//                 'Transaction type changed':
//                     oldTransaction?.type !== newTransaction?.type,
//                 'Old cash amount': oldTransaction?.cashTransaction?.amount,
//                 'New cash amount': newTransaction?.cashTransaction?.amount,
//                 'Cash amount changed':
//                     oldTransaction?.cashTransaction?.amount !==
//                     newTransaction?.cashTransaction?.amount,
//                 'Old total fees': calculateTotalFees(oldTransaction?.fees),
//                 'New total fees': calculateTotalFees(newTransaction?.fees),
//                 'Total fees changed':
//                     calculateTotalFees(oldTransaction?.fees) !==
//                     calculateTotalFees(newTransaction?.fees),
//                 'Old cash balance change': oldTransaction?.cashBalanceChange,
//                 'New cash balance change': newTransaction?.cashBalanceChange,
//                 'Cash balance change changed':
//                     oldTransaction?.cashBalanceChange !==
//                     newTransaction?.cashBalanceChange,
//                 'Old cash balance': oldCashAsset?.balance,
//                 'New cash balance': newCashAsset?.balance,
//             });
//         }

//         if (operation.type === 'DELETE_GROUP_TRANSACTION') {
//             console.table({
//                 'Operation type': 'DELETE_GROUP_TRANSACTION',
//                 ID: oldTransaction?.id,
//                 'Transaction type': oldTransaction?.type,
//                 'Cash amount': oldTransaction?.cashTransaction?.amount,
//                 'Total fees': calculateTotalFees(oldTransaction?.fees),
//                 'Cash balance change': oldTransaction?.cashBalanceChange,
//                 'Old cash balance': oldCashAsset?.balance,
//                 'New cash balance': newCashAsset?.balance,
//             });
//         }

//         if (
//             [
//                 'ADD_FEES_TO_GROUP_TRANSACTION',
//                 'REMOVE_FEES_FROM_GROUP_TRANSACTION',
//                 'EDIT_GROUP_TRANSACTION_FEES',
//             ].includes(operation.type)
//         ) {
//             console.table({
//                 'Operation type': operation.type,
//                 ID: newTransaction?.id,
//                 'Transaction type': newTransaction?.type,
//                 'Cash amount': newTransaction?.cashTransaction?.amount,
//                 'Old total fees': calculateTotalFees(oldTransaction?.fees),
//                 'New total fees': calculateTotalFees(newTransaction?.fees),
//                 'Old cash balance change': oldTransaction?.cashBalanceChange,
//                 'New cash balance change': newTransaction?.cashBalanceChange,
//                 'Old cash balance': oldCashAsset?.balance,
//                 'New cash balance': newCashAsset?.balance,
//             });
//         }
//     }

//     const finalCashBalance = document.state.global.portfolio.find(a =>
//         isCashAsset(a),
//     ).balance;

//     const finalCashBalanceChange = document.state.global.transactions.reduce(
//         (acc, tx) => acc + tx.cashBalanceChange,
//         0,
//     );

//     console.table({
//         'Final cash balance': finalCashBalance,
//         'Final cash balance change': finalCashBalanceChange,
//     });

//     utils.saveToFile(document, './', 'output');
// }

// function sleep(ms) {
//     return new Promise(resolve => setTimeout(resolve, ms));
// }
