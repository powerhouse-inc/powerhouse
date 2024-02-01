import type { Meta, StoryObj } from '@storybook/react';
import { Control, useForm } from 'react-hook-form';
import {
    FeeeItem,
    RWAFeeInputs,
    RWAFeesTable,
    RWAFeesTableProps,
} from './fees-table';

const items: FeeeItem[] = [
    {
        id: '1',
        serviceProvider: 'Service Provider 1',
        feeType: 'Fee Type 1',
        accountID: 'Account ID 1',
        fee: 1.0,
    },
    {
        id: '2',
        serviceProvider: 'Service Provider 2',
        feeType: 'Fee Type 2',
        accountID: 'Account ID 2',
        fee: 2.0,
    },
    {
        id: '3',
        serviceProvider: 'Service Provider 3',
        feeType: 'Fee Type 3',
        accountID: 'Account ID 3',
        fee: 3.0,
    },
    {
        id: '4',
        serviceProvider: 'Service Provider 4',
        feeType: 'Fee Type 4',
        accountID: 'Account ID 4',
        fee: 4.0,
    },
];

const meta: Meta<typeof RWAFeesTable> = {
    title: 'RWA/Components/RWAFeesTable',
    component: RWAFeesTable,
    argTypes: {
        labels: { control: 'object' },
        mode: {
            options: ['view', 'edit'],
            control: { type: 'radio' },
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

type TestInputs = RWAFeeInputs & { test: string };

const Form = (props: RWAFeesTableProps) => {
    const { control } = useForm<TestInputs>({
        defaultValues: {
            test: 'test',
            feesTable: items,
        },
    });

    return (
        <RWAFeesTable
            {...props}
            control={control as unknown as Control<RWAFeeInputs>}
        />
    );
};

export const Primary: Story = {
    args: {
        mode: 'view',
        labels: {
            serviceProvider: 'Service Provider',
            feeType: 'Fee Type',
            accountID: 'Account ID',
            fee: 'Fee $ USD',
        },
    },
    render: Form,
};
