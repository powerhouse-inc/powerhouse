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
    readonly feeInputs: FieldArrayWithId<GroupTransactionFormInputs, 'fees'>[];
    readonly serviceProviderFeeTypes: ServiceProviderFeeType[];
    readonly serviceProviderFeeTypeOptions: { label: string; value: string }[];
    readonly setShowServiceProviderFeeTypeModal: (show: boolean) => void;
    readonly register: UseFormRegister<GroupTransactionFormInputs>;
    readonly control: Control<GroupTransactionFormInputs>;
    readonly watch: UseFormWatch<GroupTransactionFormInputs>;
    readonly append: UseFieldArrayAppend<GroupTransactionFormInputs, 'fees'>;
    readonly remove: UseFieldArrayRemove;
    readonly errors: FieldErrors<GroupTransactionFormInputs>;
    readonly isViewOnly: boolean;
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
                                        className={twMerge(
                                            'py-2 text-left font-medium text-gray-600',
                                            heading === 'Amount' &&
                                                !props.isViewOnly &&
                                                'text-right',
                                        )}
                                        key={heading}
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
                                        <td className="w-52" />
                                        <td className="w-96">
                                            <RWATableSelect
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
                                                control={props.control}
                                                disabled={props.isViewOnly}
                                                name={`fees.${index}.serviceProviderFeeTypeId`}
                                                options={
                                                    props.serviceProviderFeeTypeOptions
                                                }
                                                rules={{
                                                    required:
                                                        'Service provider is required',
                                                }}
                                            />
                                        </td>
                                        <td className="w-52">
                                            <RWANumberInput
                                                aria-invalid={
                                                    props.errors.fees?.[index]
                                                        ?.amount
                                                        ? 'true'
                                                        : 'false'
                                                }
                                                control={props.control}
                                                currency="USD"
                                                disabled={props.isViewOnly}
                                                name={
                                                    `fees.${index}.amount` as Path<GroupTransactionFormInputs>
                                                }
                                                placeholder="E.g. $1,000.00"
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
                                            />
                                        </td>
                                        <td className="">
                                            {!props.isViewOnly && (
                                                <button
                                                    className="flex items-center"
                                                    onClick={() =>
                                                        props.remove(index)
                                                    }
                                                    type="button"
                                                >
                                                    <Icon
                                                        className="text-gray-900"
                                                        name="Xmark"
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
                    className="ml-[234px] mt-1 flex w-fit items-center justify-center gap-x-2 rounded-lg bg-white pb-6 text-sm font-semibold text-gray-900"
                    onClick={() =>
                        props.append({
                            amount: null,
                            serviceProviderFeeTypeId:
                                props.serviceProviderFeeTypes[0]?.id,
                        })
                    }
                >
                    <span>Add Fee</span>
                    <Icon name="Plus" size={16} />
                </button>
            )}
        </>
    );
}
