import { Icon } from '@/powerhouse';
import {
    Account,
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
    accounts: Account[];
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

    const serviceProviderFeeTypeOptions = props.serviceProviderFeeTypes.map(
        spft => ({
            label: `${spft.name} — ${spft.feeType} — ${props.accounts.find(account => account.id === spft.accountId)?.reference}`,
            value: spft.id,
        }),
    );

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
                                                required
                                                control={props.control}
                                                name={`fees.${index}.serviceProviderFeeTypeId`}
                                                disabled={props.isViewOnly}
                                                options={
                                                    serviceProviderFeeTypeOptions
                                                }
                                                addItemButtonProps={{
                                                    onClick: () =>
                                                        props.setShowServiceProviderFeeTypeModal(
                                                            true,
                                                        ),
                                                    label: 'Add Service Provider',
                                                }}
                                            />
                                        </td>
                                        <td className="w-52">
                                            <RWANumberInput
                                                required
                                                name={
                                                    `fees.${index}.amount` as Path<GroupTransactionFormInputs>
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
