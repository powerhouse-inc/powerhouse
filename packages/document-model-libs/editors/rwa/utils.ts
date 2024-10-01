import { TransactionFeeInput } from '@powerhousedao/design-system';
import { TransactionFee } from '../../document-models/real-world-assets';

export function verifyTransactionFeeFields(
    fees: TransactionFeeInput[],
): asserts fees is TransactionFee[] {
    for (const fee of fees) {
        if (!fee.amount) {
            throw new Error(`Transaction fee must have an amount`);
        }
        if (!fee.serviceProviderFeeTypeId) {
            throw new Error(
                `Transaction fee must have a service provider fee type`,
            );
        }
    }
}
