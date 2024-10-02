import type { Meta, StoryObj } from '@storybook/react';
import { useCallback } from 'react';

import { mockStateInitial, mockStateWithData } from '@/rwa/mocks/state';
import { utils } from 'document-model/document';
import { getColumnCount } from '../hooks/useColumnPriority';
import { ServiceProviderFeeTypeFormInputs } from '../types';
import {
    ServiceProviderFeeTypesTable,
    ServiceProviderFeeTypesTableProps,
} from './service-provider-fee-types-table';

const meta: Meta<typeof ServiceProviderFeeTypesTable> = {
    title: 'RWA/Components/Service Provider Fee Types Table',
    component: ServiceProviderFeeTypesTable,
};

export default meta;
type Story = StoryObj<typeof meta>;

const columnCountByTableWidth = {
    1520: 12,
    1394: 11,
    1239: 10,
    1112: 9,
    984: 8,
};

export const Empty: Story = {
    args: {
        state: mockStateInitial,
    },
    render: function Wrapper(args) {
        function createServiceProviderFeeTypeFromFormInputs(
            data: ServiceProviderFeeTypeFormInputs,
        ) {
            const id = utils.hashKey();

            return {
                ...data,
                id,
            };
        }

        const onSubmitEdit: ServiceProviderFeeTypesTableProps['onSubmitEdit'] =
            useCallback(data => {
                const serviceProviderFeeType =
                    createServiceProviderFeeTypeFromFormInputs(data);
                console.log({ serviceProviderFeeType, data });
            }, []);

        const onSubmitCreate: ServiceProviderFeeTypesTableProps['onSubmitCreate'] =
            useCallback(data => {
                const serviceProviderFeeType =
                    createServiceProviderFeeTypeFromFormInputs(data);
                console.log({ serviceProviderFeeType, data });
            }, []);

        const onSubmitCreateAccount: ServiceProviderFeeTypesTableProps['onSubmitCreateAccount'] =
            useCallback(data => {
                console.log({ data });
            }, []);

        const argsWithHandlers: ServiceProviderFeeTypesTableProps = {
            ...args,
            onSubmitCreate,
            onSubmitEdit,
            onSubmitCreateAccount,
        };
        return (
            <div className="flex flex-col gap-4">
                <div className="w-screen">
                    <p>parent element width: 100%</p>
                    <ServiceProviderFeeTypesTable {...argsWithHandlers} />
                </div>
                {Object.keys(columnCountByTableWidth)
                    .map(Number)
                    .map(width => width + 50)
                    .map(width => (
                        <div key={width} style={{ width: `${width}px` }}>
                            <p>parent element width: {width}px</p>
                            <p>
                                column count:{' '}
                                {getColumnCount(width, columnCountByTableWidth)}
                            </p>
                            <ServiceProviderFeeTypesTable
                                {...argsWithHandlers}
                            />
                        </div>
                    ))}
            </div>
        );
    },
};

export const WithDataReadOnly: Story = {
    ...Empty,
    args: {
        ...Empty.args,
        state: mockStateWithData,
    },
};

export const WithDataIsAllowedToCreateDocuments: Story = {
    ...WithDataReadOnly,
    args: {
        ...WithDataReadOnly.args,
        isAllowedToCreateDocuments: true,
        isAllowedToEditDocuments: true,
    },
};
