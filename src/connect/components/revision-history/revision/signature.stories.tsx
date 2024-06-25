import { Meta, StoryObj } from '@storybook/react';
import { Signature } from './signature';

const meta = {
    title: 'Connect/Components/Revision History/Revision/Signature',
    component: Signature,
} satisfies Meta<typeof Signature>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NotVerified: Story = {
    args: {
        signatures: [
            {
                timestamp: 1719232415114,
                signerAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
                hash: 'wH041NamJQq3AHgk8tD/suXDDI=',
                signatureBytes: '0x1234',
                isVerified: false,
            },
            {
                timestamp: 1719232415114,
                signerAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
                hash: 'wH041NamJQq3AHgk8tD/suXDDI=',
                signatureBytes: '0x1234',
                isVerified: false,
            },
        ],
    },
};

export const PartiallyVerified: Story = {
    args: {
        signatures: [
            {
                timestamp: 1719232415114,
                signerAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
                hash: 'wH041NamJQq3AHgk8tD/suXDDI=',
                signatureBytes: '0x1234',
                isVerified: true,
            },
            {
                timestamp: 1719232415114,
                signerAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
                hash: 'wH041NamJQq3AHgk8tD/suXDDI=',
                signatureBytes: '0x1234',
                isVerified: false,
            },
        ],
    },
};

export const Verified: Story = {
    args: {
        signatures: [
            {
                timestamp: 1719232415114,
                signerAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
                hash: 'wH041NamJQq3AHgk8tD/suXDDI=',
                signatureBytes: '0x1234',
                isVerified: true,
            },
            {
                timestamp: 1719232415114,
                signerAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
                hash: 'wH041NamJQq3AHgk8tD/suXDDI=',
                signatureBytes: '0x1234',
                isVerified: true,
            },
        ],
    },
};
