import type { Meta, StoryObj } from '@storybook/react';
import { useCallback } from 'react';

import { mockStateInitial, mockStateWithData } from '@/rwa/mocks/state';
import { utils } from 'document-model/document';
import { getColumnCount } from '../hooks/useColumnPriority';
import { SPVFormInputs } from '../types';
import { SPVsTable, SPVsTableProps } from './spvs-table';

const meta: Meta<typeof SPVsTable> = {
    title: 'RWA/Components/SPVs Table',
    component: SPVsTable,
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
        function createSPVFromFormInputs(data: SPVFormInputs) {
            const id = utils.hashKey();

            return {
                ...data,
                id,
            };
        }

        const onSubmitEdit: SPVsTableProps['onSubmitEdit'] = useCallback(
            data => {
                const account = createSPVFromFormInputs(data);
                console.log({ account, data });
            },
            [],
        );

        const onSubmitCreate: SPVsTableProps['onSubmitCreate'] = useCallback(
            data => {
                const account = createSPVFromFormInputs(data);
                console.log({ account, data });
            },
            [],
        );

        const argsWithHandlers: SPVsTableProps = {
            ...args,
            onSubmitCreate,
            onSubmitEdit,
        };
        return (
            <div className="flex flex-col gap-4">
                <div className="w-screen">
                    <p>parent element width: 100%</p>
                    <SPVsTable {...argsWithHandlers} />
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
                            <SPVsTable {...argsWithHandlers} />
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

export const WithDataEditable: Story = {
    ...WithDataReadOnly,
    args: {
        ...WithDataReadOnly.args,
        isAllowedToCreateDocuments: true,
        isAllowedToEditDocuments: true,
    },
};
