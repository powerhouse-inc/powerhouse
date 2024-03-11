import { Icon } from '@/powerhouse';
import { ServiceProviderFeeType } from '@/rwa';
import {
    Control,
    FieldArrayWithId,
    FieldValues,
    Path,
    UseFieldArrayAppend,
    UseFieldArrayRemove,
    UseFormRegister,
    UseFormWatch,
} from 'react-hook-form';
import { GroupTransactionDetailInputs } from '..';
import { RWATableTextInput } from '../table-inputs';
import { ServiceProviderAndFeeTypeTableInput } from './service-provider-fee-type-table-input';

type Props<ControlInputs extends FieldValues> = {
    feeInputs: FieldArrayWithId<GroupTransactionDetailInputs, 'fees'>[];
    serviceProviderFeeTypes: ServiceProviderFeeType[];
    register: UseFormRegister<GroupTransactionDetailInputs>;
    control: Control<ControlInputs>;
    watch: UseFormWatch<GroupTransactionDetailInputs>;
    append: UseFieldArrayAppend<GroupTransactionDetailInputs, 'fees'>;
    remove: UseFieldArrayRemove;
    isViewOnly: boolean;
};

export function FeeTransactionsTable<ControlInputs extends FieldValues>(
    props: Props<ControlInputs>,
) {
    const headings = ['Fees', 'Service Provider', 'Fee USD', ''];

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
                    <table className="w-full">
                        <thead className="mb-2">
                            <tr>
                                {headings.map(heading => (
                                    <th
                                        key={heading}
                                        className="p-2 text-left text-xs font-medium text-gray-600"
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
                                        <td className="w-1/6 py-1"></td>
                                        <td className="w-4/6 min-w-fit py-1 pr-4">
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
                                        <td className="w-1/12 py-1 pr-4">
                                            <RWATableTextInput
                                                name={
                                                    `fees.${index}.amount` as Path<ControlInputs>
                                                }
                                                required
                                                control={props.control}
                                                disabled={props.isViewOnly}
                                            />
                                        </td>
                                        <td className="w-fit py-1">
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
                            amount: 0,
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
