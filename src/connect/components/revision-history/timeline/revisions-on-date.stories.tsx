import { Meta, StoryObj } from '@storybook/react';
import { RevisionsOnDate } from './revisions-on-date';

const meta = {
    title: 'Connect/Components/Revision History/Revisions On Date',
    component: RevisionsOnDate,
} satisfies Meta<typeof RevisionsOnDate>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        date: '2024-06-13T14:39:12.936Z',
        revisionsAndSkips: [
            {
                operationIndex: 1,
                eventId: '123',
                stateHash: 'wH041NamJQq3AHgk8tD/suXDDI=',
                operationType: 'APPROVE_BUDGET',
                operationInput: {
                    id: 'eByxUvWzZtNOPbdH8JZIZI/beoO-',
                    reference: 'OC303687',
                    label: 'Account 1',
                    nested: {
                        example: 'nested',
                    },
                },
                address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
                chainId: 1,
                timestamp: 1719232415114,
                signatures: [
                    {
                        timestamp: 1719232415114,
                        signerAddress:
                            '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
                        hash: 'wH041NamJQq3AHgk8tD/suXDDI=',
                        signatureBytes: '0x1234',
                        isVerified: true,
                    },
                    {
                        timestamp: 1719232415114,
                        signerAddress:
                            '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
                        hash: 'wH041NamJQq3AHgk8tD/suXDDI=',
                        signatureBytes: '0x1234',
                        isVerified: true,
                    },
                ],
                errors: [],
            },
            {
                operationIndex: 2,
                eventId: '123',
                stateHash: 'wH041NamJQq3AHgk8tD/suXDDI=',
                operationType: 'APPROVE_BUDGET',
                operationInput: {
                    id: 'eByxUvWzZtNOPbdH8JZIZI/beoO-',
                    reference: 'OC303687',
                    label: 'Account 1',
                    nested: {
                        example: 'nested',
                    },
                },
                address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
                chainId: 1,
                timestamp: 1719232415114,
                signatures: [
                    {
                        timestamp: 1719232415114,
                        signerAddress:
                            '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
                        hash: 'wH041NamJQq3AHgk8tD/suXDDI=',
                        signatureBytes: '0x1234',
                        isVerified: false,
                    },
                    {
                        timestamp: 1719232415114,
                        signerAddress:
                            '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
                        hash: 'wH041NamJQq3AHgk8tD/suXDDI=',
                        signatureBytes: '0x1234',
                        isVerified: true,
                    },
                ],
                errors: ['Data mismatch detected'],
            },
            {
                operationIndex: 3,
                eventId: '123',
                stateHash: 'wH041NamJQq3AHgk8tD/suXDDI=',
                operationType: 'APPROVE_BUDGET',
                operationInput: {
                    id: 'eByxUvWzZtNOPbdH8JZIZI/beoO-',
                    reference: 'OC303687',
                    label: 'Account 1',
                    nested: {
                        example: 'nested',
                    },
                },
                address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
                chainId: 1,
                timestamp: 1719232415114,
                signatures: [
                    {
                        timestamp: 1719232415114,
                        signerAddress:
                            '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
                        hash: 'wH041NamJQq3AHgk8tD/suXDDI=',
                        signatureBytes: '0x1234',
                        isVerified: false,
                    },
                    {
                        timestamp: 1719232415114,
                        signerAddress:
                            '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
                        hash: 'wH041NamJQq3AHgk8tD/suXDDI=',
                        signatureBytes: '0x1234',
                        isVerified: false,
                    },
                ],
                errors: ['Data mismatch detected'],
            },
            {
                operationIndex: 4,
                skipCount: 1,
            },
            {
                operationIndex: 6,
                eventId: '123',
                stateHash: 'wH041NamJQq3AHgk8tD/suXDDI=',
                operationType: 'APPROVE_BUDGET',
                operationInput: {
                    id: 'eByxUvWzZtNOPbdH8JZIZI/beoO-',
                    reference: 'OC303687',
                    label: 'Account 1',
                    nested: {
                        example: 'nested',
                    },
                },
                address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
                chainId: 1,
                timestamp: 1719232415114,
                signatures: [
                    {
                        timestamp: 1719232415114,
                        signerAddress:
                            '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
                        hash: 'wH041NamJQq3AHgk8tD/suXDDI=',
                        signatureBytes: '0x1234',
                        isVerified: true,
                    },
                    {
                        timestamp: 1719232415114,
                        signerAddress:
                            '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
                        hash: 'wH041NamJQq3AHgk8tD/suXDDI=',
                        signatureBytes: '0x1234',
                        isVerified: true,
                    },
                ],
                errors: [],
            },
            {
                operationIndex: 7,
                eventId: '123',
                stateHash: 'wH041NamJQq3AHgk8tD/suXDDI=',
                operationType: 'APPROVE_BUDGET',
                operationInput: {
                    id: 'eByxUvWzZtNOPbdH8JZIZI/beoO-',
                    reference: 'OC303687',
                    label: 'Account 1',
                    nested: {
                        example: 'nested',
                    },
                },
                address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
                chainId: 1,
                timestamp: 1719232415114,
                signatures: [
                    {
                        timestamp: 1719232415114,
                        signerAddress:
                            '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
                        hash: 'wH041NamJQq3AHgk8tD/suXDDI=',
                        signatureBytes: '0x1234',
                        isVerified: false,
                    },
                    {
                        timestamp: 1719232415114,
                        signerAddress:
                            '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
                        hash: 'wH041NamJQq3AHgk8tD/suXDDI=',
                        signatureBytes: '0x1234',
                        isVerified: true,
                    },
                ],
                errors: ['Data mismatch detected'],
            },
            {
                operationIndex: 8,
                eventId: '123',
                stateHash: 'wH041NamJQq3AHgk8tD/suXDDI=',
                operationType: 'APPROVE_BUDGET',
                operationInput: {
                    id: 'eByxUvWzZtNOPbdH8JZIZI/beoO-',
                    reference: 'OC303687',
                    label: 'Account 1',
                    nested: {
                        example: 'nested',
                    },
                },
                address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
                chainId: 1,
                timestamp: 1719232415114,
                signatures: [
                    {
                        timestamp: 1719232415114,
                        signerAddress:
                            '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
                        hash: 'wH041NamJQq3AHgk8tD/suXDDI=',
                        signatureBytes: '0x1234',
                        isVerified: false,
                    },
                    {
                        timestamp: 1719232415114,
                        signerAddress:
                            '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
                        hash: 'wH041NamJQq3AHgk8tD/suXDDI=',
                        signatureBytes: '0x1234',
                        isVerified: false,
                    },
                ],
                errors: ['Data mismatch detected'],
            },
            {
                operationIndex: 9,
                skipCount: 3,
            },
        ],
    },
};
