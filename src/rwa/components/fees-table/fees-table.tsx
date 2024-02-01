import { Key, Row } from 'react-aria-components';
import { Control, Controller, useFieldArray } from 'react-hook-form';
import { twMerge } from 'tailwind-merge';
import { RWAComponentMode } from '../../types';
import { RWATable, RWATableCell } from '../table';
import { RWAFeesTextInput } from './fees-input';

export type FeeeItem = {
    id: Key;
    serviceProvider: string;
    feeType: string;
    accountID: string;
    fee: number;
};

export type RWAFeeInputs = {
    feesTable: FeeeItem[];
};

const defaultLabels = {
    serviceProvider: 'Service Provider',
    feeType: 'Fee Type',
    accountID: 'Account ID',
    fee: 'Fee $ USD',
};

export interface RWAFeesTableProps {
    control: Control<RWAFeeInputs>;
    mode?: RWAComponentMode;
    labels?: {
        serviceProvider?: string;
        feeType?: string;
        accountID?: string;
        fee?: string;
    };
}

export const RWAFeesTable: React.FC<RWAFeesTableProps> = props => {
    const { control, mode = 'view', labels = defaultLabels } = props;

    const { fields } = useFieldArray({
        control,
        name: 'feesTable',
    });

    const isEditMode = mode === 'edit';

    return (
        <RWATable
            className="w-full"
            tableProps={{
                className: 'w-full',
            }}
            tableHeaderProps={{
                className:
                    '[&>tr>th:not(:first-child)]:border-l [&>tr>th:not(:first-child)]:border-gray-300',
            }}
            header={[
                { id: 'serviceProvider', label: labels.serviceProvider },
                { id: 'feeType', label: labels.feeType },
                { id: 'accountID', label: labels.accountID },
                { id: 'fee', label: labels.fee },
            ]}
        >
            {fields.map((item, index) => (
                <Row
                    key={item.id}
                    className={twMerge(
                        '[&>td:not(:first-child)]:border-l [&>td:not(:first-child)]:border-gray-300 [&>td]:p-0',
                        isEditMode && '[&>td[tabindex="0"]]:bg-gray-100',
                        index % 2 !== 0 && 'bg-gray-50',
                    )}
                >
                    <RWATableCell className="w-[30%]">
                        <Controller
                            name={`feesTable.${index}.serviceProvider`}
                            control={control}
                            render={({
                                field: { onBlur, onChange, value },
                            }) => (
                                <RWAFeesTextInput
                                    onBlur={onBlur}
                                    onChange={onChange}
                                    value={value}
                                    disabled={!isEditMode}
                                />
                            )}
                        />
                    </RWATableCell>
                    <RWATableCell className="w-[20%]">
                        <Controller
                            name={`feesTable.${index}.feeType`}
                            control={control}
                            render={({
                                field: { onBlur, onChange, value },
                            }) => (
                                <RWAFeesTextInput
                                    onBlur={onBlur}
                                    onChange={onChange}
                                    value={value}
                                    disabled={!isEditMode}
                                />
                            )}
                        />
                    </RWATableCell>
                    <RWATableCell className="w-[30%]">
                        <Controller
                            name={`feesTable.${index}.accountID`}
                            control={control}
                            render={({
                                field: { onBlur, onChange, value },
                            }) => (
                                <RWAFeesTextInput
                                    onBlur={onBlur}
                                    onChange={onChange}
                                    value={value}
                                    disabled={!isEditMode}
                                />
                            )}
                        />
                    </RWATableCell>
                    <RWATableCell className="w-[20%]">
                        <Controller
                            name={`feesTable.${index}.fee`}
                            control={control}
                            render={({
                                field: { onBlur, onChange, value },
                            }) => (
                                <RWAFeesTextInput
                                    onBlur={onBlur}
                                    onChange={onChange}
                                    value={value.toString()}
                                    disabled={!isEditMode}
                                />
                            )}
                        />
                    </RWATableCell>
                </Row>
            ))}
        </RWATable>
    );
};
