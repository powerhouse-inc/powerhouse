import type { Meta, StoryObj } from '@storybook/react';
import { useForm } from 'react-hook-form';
import {
    RWACreateAssetForm,
    RWACreateAssetFormProps,
    RWACreateAssetInputs,
} from './create-asset-form';

const meta: Meta<typeof RWACreateAssetForm> = {
    title: 'RWA/Components/RWACreateAssetForm',
    component: RWACreateAssetForm,
    argTypes: {},
};

export default meta;
type Story = StoryObj<typeof meta>;

const Form = (props: RWACreateAssetFormProps) => {
    const { control } = useForm<RWACreateAssetInputs>();
    return <RWACreateAssetForm {...props} control={control} />;
};

export const Primary: Story = {
    args: {},
    render: Form,
};
