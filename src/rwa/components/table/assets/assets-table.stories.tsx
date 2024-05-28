import {
    mockCashAsset,
    mockFixedIncomeTypes,
    mockFixedIncomes,
    mockGroupTransactions,
    mockSPVs,
} from '@/rwa/mocks';
import { mockStateInitial } from '@/rwa/mocks/state';
import { useArgs } from '@storybook/preview-api';
import { Meta, StoryObj } from '@storybook/react';
import { utils } from 'document-model/document';
import { useCallback } from 'react';
import { useInterval } from 'usehooks-ts';
import { defaultColumnCountByTableWidth } from '../constants';
import { getColumnCount } from '../hooks';
import { AssetFormInputs } from '../types';
import { AssetsTable, AssetsTableProps } from './assets-table';

const meta: Meta<typeof AssetsTable> = {
    title: 'RWA/Components/Assets Table',
    component: AssetsTable,
};

export default meta;
type Story = StoryObj<
    AssetsTableProps & {
        simulateBackgroundUpdates?: boolean;
    }
>;

function createAssetFromFormInputs(data: AssetFormInputs) {
    const id = utils.hashKey();
    const maturity = data.maturity?.toString() ?? null;

    return {
        ...data,
        id,
        maturity,
    };
}

export const Empty: Story = {
    args: {
        state: mockStateInitial,
        simulateBackgroundUpdates: false,
    },
    render: function Wrapper(args) {
        const [, setArgs] = useArgs<typeof args>();
        useInterval(
            () => {
                setArgs({
                    ...args,
                    state: {
                        ...args.state,
                        portfolio: [
                            ...args.state.portfolio,
                            { ...mockFixedIncomes[0], id: `new-${Date.now()}` },
                        ],
                    },
                });
            },
            args.simulateBackgroundUpdates ? 3000 : 0,
        );

        const onSubmitEdit: AssetsTableProps['onSubmitEdit'] = useCallback(
            data => {
                const asset = createAssetFromFormInputs(data);
                console.log({ asset, data });
            },
            [],
        );

        const onSubmitCreate: AssetsTableProps['onSubmitCreate'] = useCallback(
            data => {
                const asset = createAssetFromFormInputs(data);
                console.log({ asset, data });
            },
            [],
        );

        const onSubmitCreateFixedIncomeType: AssetsTableProps['onSubmitCreateFixedIncomeType'] =
            useCallback(data => {
                console.log({ data });
            }, []);

        const onSubmitCreateSpv: AssetsTableProps['onSubmitCreateSpv'] =
            useCallback(data => {
                console.log({ data });
            }, []);

        const argsWithHandlers: AssetsTableProps = {
            ...args,
            onSubmitCreate,
            onSubmitEdit,
            onSubmitCreateFixedIncomeType,
            onSubmitCreateSpv,
        };
        return (
            <div className="flex flex-col gap-4">
                <div className="w-screen">
                    <p>parent element width: 100%</p>
                    <AssetsTable {...argsWithHandlers} />
                </div>
                {Object.keys(defaultColumnCountByTableWidth)
                    .map(Number)
                    .map(width => width + 50)
                    .map(width => (
                        <div key={width} style={{ width: `${width}px` }}>
                            <p>parent element width: {width}px</p>
                            <p>
                                column count:{' '}
                                {getColumnCount(
                                    width,
                                    defaultColumnCountByTableWidth,
                                )}
                            </p>
                            <AssetsTable {...argsWithHandlers} />
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
        state: {
            ...mockStateInitial,
            portfolio: [mockCashAsset, ...mockFixedIncomes],
            fixedIncomeTypes: mockFixedIncomeTypes,
            spvs: mockSPVs,
            transactions: mockGroupTransactions,
        },
    },
};

export const WithDataAllowedToCreateDocuments: Story = {
    ...WithDataReadOnly,
    args: {
        ...WithDataReadOnly.args,
        isAllowedToCreateDocuments: true,
        isAllowedToEditDocuments: true,
    },
};
