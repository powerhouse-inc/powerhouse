import { Icon } from '@/powerhouse';
import {
    GroupTransactionFormInputs,
    RWANumberInput,
    RWATableSelect,
    ServiceProviderFeeType,
} from '@/rwa';
import {
    Control,
    FieldArrayWithId,
    FieldErrors,
    Path,
    UseFieldArrayAppend,
    UseFieldArrayRemove,
    UseFormRegister,
    UseFormWatch,
} from 'react-hook-form';
import { twMerge } from 'tailwind-merge';

type Props = {
    feeInputs: FieldArrayWithId<GroupTransactionFormInputs, 'fees'>[];
    serviceProviderFeeTypes: ServiceProviderFeeType[];
    serviceProviderFeeTypeOptions: { label: string; value: string }[];
    setShowServiceProviderFeeTypeModal: (show: boolean) => void;
    register: UseFormRegister<GroupTransactionFormInputs>;
    control: Control<GroupTransactionFormInputs>;
    watch: UseFormWatch<GroupTransactionFormInputs>;
    append: UseFieldArrayAppend<GroupTransactionFormInputs, 'fees'>;
    remove: UseFieldArrayRemove;
    errors: FieldErrors<GroupTransactionFormInputs>;
    isViewOnly: boolean;
};

export function FeeTransactionsTable(props: Props) {
    const headings = ['Fees', 'Service Provider', 'Amount', ''] as const;

    return (
        <>
            {props.feeInputs.length > 0 && (
                <div className="bg-gray-50 pl-5 pt-3">
                    <table className="w-full border-separate text-xs font-medium">
                        <thead className="mb-2">
                            <tr>
                                {headings.map(heading => (
                                    <th
                                        key={heading}
                                        className={twMerge(
                                            'py-2 text-left font-medium text-gray-600',
                                            heading === 'Amount' &&
                                                !props.isViewOnly &&
                                                'text-right',
                                        )}
                                    >
                                        {heading}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {props.feeInputs.map((feeInput, index) => {
                                return (
                                    <tr key={feeInput.id}>
                                        <td className="w-52"></td>
                                        <td className="w-96">
                                            <RWATableSelect
                                                rules={{
                                                    required:
                                                        'Service provider is required',
                                                }}
                                                control={props.control}
                                                name={`fees.${index}.serviceProviderFeeTypeId`}
                                                disabled={props.isViewOnly}
                                                options={
                                                    props.serviceProviderFeeTypeOptions
                                                }
                                                addItemButtonProps={{
                                                    onClick: () =>
                                                        props.setShowServiceProviderFeeTypeModal(
                                                            true,
                                                        ),
                                                    label: 'Add Service Provider',
                                                }}
                                                aria-invalid={
                                                    props.errors.fees?.[index]
                                                        ?.serviceProviderFeeTypeId
                                                        ? 'true'
                                                        : 'false'
                                                }
                                            />
                                        </td>
                                        <td className="w-52">
                                            <RWANumberInput
                                                rules={{
                                                    required:
                                                        'Amount is required',
                                                    validate: {
                                                        positive: value =>
                                                            (!!value &&
                                                                Number(value) >
                                                                    0) ||
                                                            'Fee amount must be greater than zero',
                                                    },
                                                }}
                                                name={
                                                    `fees.${index}.amount` as Path<GroupTransactionFormInputs>
                                                }
                                                control={props.control}
                                                disabled={props.isViewOnly}
                                                currency="USD"
                                                aria-invalid={
                                                    props.errors.fees?.[index]
                                                        ?.amount
                                                        ? 'true'
                                                        : 'false'
                                                }
                                                placeholder="E.g. $1,000.00"
                                            />
                                        </td>
                                        <td className="">
                                            {!props.isViewOnly && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        props.remove(index)
                                                    }
                                                    className="flex items-center"
                                                >
                                                    <Icon
                                                        name="xmark"
                                                        className="text-gray-900"
                                                    />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            {!props.isViewOnly && (
                <button
                    onClick={() =>
                        props.append({
                            amount: null,
                            serviceProviderFeeTypeId:
                                props.serviceProviderFeeTypes[0]?.id,
                        })
                    }
                    className="ml-[234px] mt-1 flex w-fit items-center justify-center gap-x-2 rounded-lg bg-white pb-6 text-sm font-semibold text-gray-900"
                >
                    <span>Add Fee</span>
                    <Icon name="plus" size={16} />
                </button>
            )}
        </>
    );
}
