import { Icon } from '@/powerhouse';
import {
    GroupTransactionFormInputs,
    RWANumberInput,
    ServiceProviderAndFeeTypeTableInput,
    ServiceProviderFeeType,
} from '@/rwa';
import {
    Control,
    FieldArrayWithId,
    FieldErrors,
    FieldValues,
    Path,
    UseFieldArrayAppend,
    UseFieldArrayRemove,
    UseFormRegister,
    UseFormWatch,
} from 'react-hook-form';
import { twMerge } from 'tailwind-merge';

type Props<ControlInputs extends FieldValues> = {
    feeInputs: FieldArrayWithId<GroupTransactionFormInputs, 'fees'>[];
    serviceProviderFeeTypes: ServiceProviderFeeType[];
    register: UseFormRegister<GroupTransactionFormInputs>;
    control: Control<ControlInputs>;
    watch: UseFormWatch<GroupTransactionFormInputs>;
    append: UseFieldArrayAppend<GroupTransactionFormInputs, 'fees'>;
    remove: UseFieldArrayRemove;
    errors: FieldErrors<GroupTransactionFormInputs>;
    isViewOnly: boolean;
};

export function FeeTransactionsTable<ControlInputs extends FieldValues>(
    props: Props<ControlInputs>,
) {
    const headings = ['Fees', 'Service Provider', 'Amount', ''] as const;

    const serviceProviderFeeTypeOptions = props.serviceProviderFeeTypes.map(
        spft => ({
            label: `${spft.name} — ${spft.feeType} — ${spft.accountId}`,
            id: spft.id,
        }),
    );

    return (
        <>
            {props.feeInputs.length > 0 && (
                <div className="bg-gray-50 px-6 pt-3">
                    <table className="w-full border-separate border-spacing-x-4 border-spacing-y-1">
                        <thead className="mb-2">
                            <tr>
                                {headings.map(heading => (
                                    <th
                                        key={heading}
                                        className={twMerge(
                                            'p-2 text-left text-xs font-medium text-gray-600',
                                            heading === 'Amount' &&
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
                                const selectedServiceProviderFeeTypeId =
                                    props.watch(
                                        `fees.${index}.serviceProviderFeeTypeId`,
                                    );

                                const selectedServiceProviderFeeType =
                                    props.serviceProviderFeeTypes.find(
                                        spft =>
                                            spft.id ===
                                            selectedServiceProviderFeeTypeId,
                                    );

                                return (
                                    <tr key={feeInput.id}>
                                        <td className=""></td>
                                        <td className="">
                                            <ServiceProviderAndFeeTypeTableInput
                                                selectedServiceProviderFeeType={
                                                    selectedServiceProviderFeeType
                                                }
                                                index={index}
                                                isViewOnly={props.isViewOnly}
                                                serviceProviderFeeTypeOptions={
                                                    serviceProviderFeeTypeOptions
                                                }
                                                control={props.control}
                                            />
                                        </td>
                                        <td className="w-1/4">
                                            <RWANumberInput
                                                required
                                                name={
                                                    `fees.${index}.amount` as Path<ControlInputs>
                                                }
                                                control={props.control}
                                                disabled={props.isViewOnly}
                                                currency="USD"
                                                aria-invalid={
                                                    props.errors.fees?.[index]
                                                        ?.amount?.type ===
                                                    'required'
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
                            amount: undefined,
                            serviceProviderFeeTypeId:
                                props.serviceProviderFeeTypes[0].id,
                        })
                    }
                    className="flex w-full items-center justify-center gap-x-2 rounded-lg bg-white pb-6 pt-0 text-sm font-semibold  text-gray-900"
                >
                    <span>Add Fee</span>
                    <Icon name="plus" size={16} />
                </button>
            )}
        </>
    );
}
