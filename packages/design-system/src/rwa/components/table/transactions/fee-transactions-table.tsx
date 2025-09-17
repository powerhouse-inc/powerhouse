import type {
  GroupTransactionFormInputs,
  ServiceProviderFeeType,
} from "@powerhousedao/design-system";
import {
  Icon,
  RWANumberInput,
  RWATableSelect,
} from "@powerhousedao/design-system";
import type { Control, FieldErrors, Path } from "react-hook-form";
import { useFieldArray } from "react-hook-form";
import { twMerge } from "tailwind-merge";

type Props = {
  readonly canHaveTransactionFees: boolean;
  readonly serviceProviderFeeTypes: ServiceProviderFeeType[];
  readonly serviceProviderFeeTypeOptions: { label: string; value: string }[];
  readonly showCreateServiceProviderFeeTypeModal: () => void;
  readonly control: Control<GroupTransactionFormInputs>;
  readonly errors: FieldErrors<GroupTransactionFormInputs>;
  readonly isViewOnly: boolean;
};

export function FeeTransactionsTable(props: Props) {
  const headings = ["Fees", "Service Provider", "Amount", ""] as const;
  const {
    canHaveTransactionFees,
    serviceProviderFeeTypes,
    serviceProviderFeeTypeOptions,
    control,
    errors,
    isViewOnly,
    showCreateServiceProviderFeeTypeModal,
  } = props;

  const { fields, append, remove } = useFieldArray({
    control,
    name: "fees",
  });

  if (!canHaveTransactionFees) {
    return null;
  }

  return (
    <>
      {fields.length > 0 && (
        <div className="bg-gray-50 pl-5 pt-3">
          <table className="w-full border-separate text-xs font-medium">
            <thead className="mb-2">
              <tr>
                {headings.map((heading) => (
                  <th
                    className={twMerge(
                      "py-2 text-left font-medium text-gray-600",
                      heading === "Amount" && !isViewOnly && "text-right",
                    )}
                    key={heading}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fields.map((feeInput, index) => {
                return (
                  <tr key={feeInput.id}>
                    <td className="w-52" />
                    <td className="w-96">
                      <RWATableSelect
                        addItemButtonProps={{
                          onClick: showCreateServiceProviderFeeTypeModal,
                          label: "Add Service Provider",
                        }}
                        aria-invalid={
                          errors.fees?.[index]?.serviceProviderFeeTypeId
                            ? "true"
                            : "false"
                        }
                        control={control}
                        disabled={isViewOnly}
                        name={`fees.${index}.serviceProviderFeeTypeId`}
                        options={serviceProviderFeeTypeOptions}
                        rules={{
                          required: "Service provider is required",
                        }}
                      />
                    </td>
                    <td className="w-52">
                      <RWANumberInput
                        aria-invalid={
                          errors.fees?.[index]?.amount ? "true" : "false"
                        }
                        control={control}
                        currency="USD"
                        disabled={isViewOnly}
                        name={
                          `fees.${index}.amount` as Path<GroupTransactionFormInputs>
                        }
                        placeholder="E.g. $1,000.00"
                        rules={{
                          required: "Amount is required",
                          validate: {
                            positive: (value) =>
                              (!!value && Number(value) > 0) ||
                              "Fee amount must be greater than zero",
                          },
                        }}
                      />
                    </td>
                    <td className="">
                      {!isViewOnly && (
                        <button
                          className="flex items-center"
                          onClick={() => remove(index)}
                          type="button"
                        >
                          <Icon className="text-gray-900" name="Xmark" />
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
      {!isViewOnly && (
        <button
          className="ml-[234px] mt-1 flex w-fit items-center justify-center gap-x-2 rounded-lg bg-white pb-6 text-sm font-semibold text-gray-900"
          onClick={() =>
            append({
              amount: null,
              serviceProviderFeeTypeId: serviceProviderFeeTypes[0]?.id,
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
