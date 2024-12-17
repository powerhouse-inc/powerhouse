/* eslint-disable react/jsx-max-depth */
import {
  AccountType,
  InputMaybe,
  LegalEntity,
  Scalars,
} from "document-models/invoice";
import React, { useCallback, useState } from "react";
import { ComponentPropsWithRef, Ref, forwardRef } from "react";
import { twMerge } from "tailwind-merge";

export type LegalEntityBasicInput = {
  id?: InputMaybe<Scalars["String"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
  streetAddress?: InputMaybe<Scalars["String"]["input"]>;
  extendedAddress?: InputMaybe<Scalars["String"]["input"]>;
  city?: InputMaybe<Scalars["String"]["input"]>;
  stateProvince?: InputMaybe<Scalars["String"]["input"]>;
  postalCode?: InputMaybe<Scalars["String"]["input"]>;
  country?: InputMaybe<Scalars["String"]["input"]>;
  email?: InputMaybe<Scalars["String"]["input"]>;
  tel?: InputMaybe<Scalars["String"]["input"]>;
};

export type LegalEntityBankInput = {
  ABA?: InputMaybe<Scalars["String"]["input"]>;
  ABAIntermediary?: InputMaybe<Scalars["String"]["input"]>;
  IBAN?: InputMaybe<Scalars["String"]["input"]>;
  IBANIntermediary?: InputMaybe<Scalars["String"]["input"]>;
  SWIFT?: InputMaybe<Scalars["String"]["input"]>;
  SWIFTIntermediary?: InputMaybe<Scalars["String"]["input"]>;
  accountNum?: InputMaybe<Scalars["String"]["input"]>;
  accountNumIntermediary?: InputMaybe<Scalars["String"]["input"]>;
  accountType?: InputMaybe<AccountType | `${AccountType}`>;
  accountTypeIntermediary?: InputMaybe<AccountType | `${AccountType}`>;
  beneficiary?: InputMaybe<Scalars["String"]["input"]>;
  beneficiaryIntermediary?: InputMaybe<Scalars["String"]["input"]>;
  city?: InputMaybe<Scalars["String"]["input"]>;
  cityIntermediary?: InputMaybe<Scalars["String"]["input"]>;
  country?: InputMaybe<Scalars["String"]["input"]>;
  countryIntermediary?: InputMaybe<Scalars["String"]["input"]>;
  extendedAddress?: InputMaybe<Scalars["String"]["input"]>;
  extendedAddressIntermediary?: InputMaybe<Scalars["String"]["input"]>;
  memo?: InputMaybe<Scalars["String"]["input"]>;
  memoIntermediary?: InputMaybe<Scalars["String"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
  nameIntermediary?: InputMaybe<Scalars["String"]["input"]>;
  postalCode?: InputMaybe<Scalars["String"]["input"]>;
  postalCodeIntermediary?: InputMaybe<Scalars["String"]["input"]>;
  stateProvince?: InputMaybe<Scalars["String"]["input"]>;
  stateProvinceIntermediary?: InputMaybe<Scalars["String"]["input"]>;
  streetAddress?: InputMaybe<Scalars["String"]["input"]>;
  streetAddressIntermediary?: InputMaybe<Scalars["String"]["input"]>;
};

const TextInput = forwardRef(function TextInput(
  props: ComponentPropsWithRef<"input">,
  ref: Ref<HTMLInputElement>,
) {
  return (
    <input
      {...props}
      className={twMerge(
        "h-8 w-full rounded-md bg-gray-100 px-3 disabled:bg-transparent disabled:p-0",
        props.className,
      )}
      ref={ref}
      type="text"
    />
  );
});

const ACCOUNT_TYPES = ["CHECKING", "SAVINGS", "TRUST"];

const AccountTypeSelect = forwardRef(function AccountTypeSelect(
  props: ComponentPropsWithRef<"select">,
  ref: Ref<HTMLSelectElement>,
) {
  return (
    <select
      {...props}
      className={twMerge(
        "h-8 w-full rounded-md bg-gray-100 px-3 disabled:bg-transparent disabled:p-0",
        props.className,
      )}
      ref={ref}
    >
      <option value="">Select Account Type</option>
      {ACCOUNT_TYPES.map((type) => (
        <option key={type} value={type}>
          {type}
        </option>
      ))}
    </select>
  );
});

export type LegalEntityBasicInputProps = Omit<
  ComponentPropsWithRef<"div">,
  "children"
> & {
  readonly value: LegalEntityBasicInput;
  readonly onChange: (value: LegalEntityBasicInput) => void;
  readonly disabled?: boolean;
};

export const LegalEntityBasicInput = forwardRef(function LegalEntityBasicInput(
  props: LegalEntityBasicInputProps,
  ref: Ref<HTMLDivElement>,
) {
  const { value, onChange, disabled, ...divProps } = props;

  const handleInputChange =
    (field: keyof LegalEntityBasicInput) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({
        ...value,
        [field]: e.target.value,
      });
    };

  return (
    <div
      {...divProps}
      className={twMerge("space-y-4", props.className)}
      ref={ref}
    >
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Name</label>
        <TextInput
          disabled={disabled}
          onChange={handleInputChange("name")}
          placeholder="Legal Entity Name"
          value={value.name ?? ""}
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Street Address
        </label>
        <TextInput
          disabled={disabled}
          onChange={handleInputChange("streetAddress")}
          placeholder="Street Address"
          value={value.streetAddress ?? ""}
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Extended Address
        </label>
        <TextInput
          disabled={disabled}
          onChange={handleInputChange("extendedAddress")}
          placeholder="Extended Address"
          value={value.extendedAddress ?? ""}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            City
          </label>
          <TextInput
            disabled={disabled}
            onChange={handleInputChange("city")}
            placeholder="City"
            value={value.city ?? ""}
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            State/Province
          </label>
          <TextInput
            disabled={disabled}
            onChange={handleInputChange("stateProvince")}
            placeholder="State/Province"
            value={value.stateProvince ?? ""}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Postal Code
          </label>
          <TextInput
            disabled={disabled}
            onChange={handleInputChange("postalCode")}
            placeholder="Postal Code"
            value={value.postalCode ?? ""}
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Country
          </label>
          <TextInput
            disabled={disabled}
            onChange={handleInputChange("country")}
            placeholder="Country"
            value={value.country ?? ""}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <TextInput
            disabled={disabled}
            onChange={handleInputChange("email")}
            placeholder="Email"
            type="email"
            value={value.email ?? ""}
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Telephone
          </label>
          <TextInput
            disabled={disabled}
            onChange={handleInputChange("tel")}
            placeholder="Telephone"
            type="tel"
            value={value.tel ?? ""}
          />
        </div>
      </div>
    </div>
  );
});

export type LegalEntityBankInputProps = Omit<
  ComponentPropsWithRef<"div">,
  "children"
> & {
  readonly value: LegalEntityBankInput;
  readonly onChange: (value: LegalEntityBankInput) => void;
  readonly disabled?: boolean;
};

export const LegalEntityBankInput = forwardRef(function LegalEntityBankInput(
  props: LegalEntityBankInputProps,
  ref: Ref<HTMLDivElement>,
) {
  const { value, onChange, disabled, ...divProps } = props;
  const [showIntermediary, setShowIntermediary] = useState(false);

  const handleInputChange = useCallback(
    function handleInputChange(
      field: keyof LegalEntityBankInput,
      event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    ) {
      onChange({
        ...value,
        [field]: event.target.value,
      });
    },
    [onChange, value],
  );

  const handleIntermediaryToggle = useCallback(
    function handleIntermediaryToggle(
      event: React.ChangeEvent<HTMLInputElement>,
    ) {
      setShowIntermediary(event.target.checked);
    },
    [],
  );

  function createInputHandler(field: keyof LegalEntityBankInput) {
    return function handleFieldChange(
      event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    ) {
      handleInputChange(field, event as React.ChangeEvent<HTMLInputElement>);
    };
  }

  return (
    <div
      {...divProps}
      className={twMerge("space-y-4", props.className)}
      ref={ref}
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Account Number
          </label>
          <TextInput
            disabled={disabled}
            onChange={createInputHandler("accountNum")}
            placeholder="Account Number"
            value={value.accountNum ?? ""}
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Account Type
          </label>
          <AccountTypeSelect
            disabled={disabled}
            onChange={createInputHandler("accountType")}
            value={value.accountType ?? ""}
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">ABA</label>
          <TextInput
            disabled={disabled}
            onChange={createInputHandler("ABA")}
            placeholder="ABA Number"
            value={value.ABA ?? ""}
          />
        </div>
      </div>
      {/* Add Beneficiary field */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Beneficiary
        </label>
        <TextInput
          disabled={disabled}
          onChange={createInputHandler("beneficiary")}
          placeholder="Beneficiary"
          value={value.beneficiary ?? ""}
        />
      </div>
      {/* Bank Information */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Bank Name
        </label>
        <TextInput
          disabled={disabled}
          onChange={createInputHandler("name")}
          placeholder="Bank Name"
          value={value.name ?? ""}
        />
      </div>
      {/* Bank Address Section */}
      <div className="space-y-4">
        <label className="block text-sm font-medium text-gray-700">
          Bank Address
        </label>
        <TextInput
          disabled={disabled}
          onChange={createInputHandler("streetAddress")}
          placeholder="Street Address"
          value={value.streetAddress ?? ""}
        />
        <TextInput
          disabled={disabled}
          onChange={createInputHandler("extendedAddress")}
          placeholder="Extended Address"
          value={value.extendedAddress ?? ""}
        />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <TextInput
              disabled={disabled}
              onChange={createInputHandler("city")}
              placeholder="City"
              value={value.city ?? ""}
            />
          </div>
          <div>
            <TextInput
              disabled={disabled}
              onChange={createInputHandler("stateProvince")}
              placeholder="State/Province"
              value={value.stateProvince ?? ""}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <TextInput
              disabled={disabled}
              onChange={createInputHandler("postalCode")}
              placeholder="Postal Code"
              value={value.postalCode ?? ""}
            />
          </div>
          <div>
            <TextInput
              disabled={disabled}
              onChange={createInputHandler("country")}
              placeholder="Country"
              value={value.country ?? ""}
            />
          </div>
        </div>
      </div>

      {/* Intermediary Bank Toggle */}
      <div className="flex items-center space-x-2">
        <input
          checked={showIntermediary}
          className="h-4 w-4 rounded border-gray-300 text-blue-600"
          id="showIntermediary"
          onChange={handleIntermediaryToggle}
          type="checkbox"
        />
        <label
          className="text-sm font-medium text-gray-700"
          htmlFor="showIntermediary"
        >
          Include Intermediary Bank
        </label>
      </div>

      {/* Intermediary Bank Section */}
      {showIntermediary ? (
        <div className="rounded-lg border border-gray-200 p-4 space-y-4">
          <h3 className="text-lg font-medium">Intermediary Bank Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Account Number
              </label>
              <TextInput
                disabled={disabled}
                onChange={createInputHandler("accountNumIntermediary")}
                placeholder="Intermediary Account Number"
                value={value.accountNumIntermediary ?? ""}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Account Type
              </label>
              <AccountTypeSelect
                disabled={disabled}
                onChange={createInputHandler("accountTypeIntermediary")}
                value={value.accountTypeIntermediary ?? ""}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                ABA
              </label>
              <TextInput
                disabled={disabled}
                onChange={createInputHandler("ABAIntermediary")}
                placeholder="Intermediary ABA Number"
                value={value.ABAIntermediary ?? ""}
              />
            </div>
          </div>

          {/* Beneficiary field */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Beneficiary
            </label>
            <TextInput
              disabled={disabled}
              onChange={createInputHandler("beneficiaryIntermediary")}
              placeholder="Intermediary Beneficiary"
              value={value.beneficiaryIntermediary ?? ""}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                SWIFT
              </label>
              <TextInput
                disabled={disabled}
                onChange={createInputHandler("SWIFTIntermediary")}
                placeholder="Intermediary SWIFT Code"
                value={value.SWIFTIntermediary ?? ""}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                IBAN
              </label>
              <TextInput
                disabled={disabled}
                onChange={createInputHandler("IBANIntermediary")}
                placeholder="Intermediary IBAN"
                value={value.IBANIntermediary ?? ""}
              />
            </div>
          </div>

          {/* Bank Information */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Bank Name
            </label>
            <TextInput
              disabled={disabled}
              onChange={createInputHandler("nameIntermediary")}
              placeholder="Intermediary Bank Name"
              value={value.nameIntermediary ?? ""}
            />
          </div>

          {/* Bank Address Section */}
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              Bank Address
            </label>
            <TextInput
              disabled={disabled}
              onChange={createInputHandler("streetAddressIntermediary")}
              placeholder="Street Address"
              value={value.streetAddressIntermediary ?? ""}
            />
            <TextInput
              disabled={disabled}
              onChange={createInputHandler("extendedAddressIntermediary")}
              placeholder="Extended Address"
              value={value.extendedAddressIntermediary ?? ""}
            />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <TextInput
                  disabled={disabled}
                  onChange={createInputHandler("cityIntermediary")}
                  placeholder="City"
                  value={value.cityIntermediary ?? ""}
                />
              </div>
              <div>
                <TextInput
                  disabled={disabled}
                  onChange={createInputHandler("stateProvinceIntermediary")}
                  placeholder="State/Province"
                  value={value.stateProvinceIntermediary ?? ""}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <TextInput
                  disabled={disabled}
                  onChange={createInputHandler("postalCodeIntermediary")}
                  placeholder="Postal Code"
                  value={value.postalCodeIntermediary ?? ""}
                />
              </div>
              <div>
                <TextInput
                  disabled={disabled}
                  onChange={createInputHandler("countryIntermediary")}
                  placeholder="Country"
                  value={value.countryIntermediary ?? ""}
                />
              </div>
            </div>
          </div>

          {/* Memo field */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Memo
            </label>
            <TextInput
              disabled={disabled}
              onChange={createInputHandler("memoIntermediary")}
              placeholder="Memo"
              value={value.memoIntermediary ?? ""}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
});

type LegalEntityFormProps = {
  readonly legalEntity: LegalEntity;
  readonly onChangeInfo?: (info: LegalEntityBasicInput) => void;
  readonly onChangeBank?: (bank: LegalEntityBankInput) => void;
  readonly basicInfoDisabled?: boolean;
  readonly bankDisabled?: boolean;
};

export function LegalEntityForm({
  legalEntity,
  onChangeInfo,
  onChangeBank,
  basicInfoDisabled,
  bankDisabled,
}: LegalEntityFormProps) {
  const basicInfo: LegalEntityBasicInput = {
    name: legalEntity.name ?? null,
    streetAddress: legalEntity.address?.streetAddress ?? null,
    extendedAddress: legalEntity.address?.extendedAddress ?? null,
    city: legalEntity.address?.city ?? null,
    stateProvince: legalEntity.address?.stateProvince ?? null,
    postalCode: legalEntity.address?.postalCode ?? null,
    country: legalEntity.country ?? null,
    email: legalEntity.contactInfo?.email ?? null,
    tel: legalEntity.contactInfo?.tel ?? null,
  };

  const bankInfo: LegalEntityBankInput = {
    accountNum: legalEntity.paymentRouting?.bank?.accountNum ?? null,
    accountNumIntermediary:
      legalEntity.paymentRouting?.bank?.intermediaryBank?.accountNum ?? null,
    beneficiary: legalEntity.paymentRouting?.bank?.beneficiary ?? null,
    beneficiaryIntermediary:
      legalEntity.paymentRouting?.bank?.intermediaryBank?.beneficiary ?? null,
    SWIFT: legalEntity.paymentRouting?.bank?.SWIFT ?? null,
    SWIFTIntermediary:
      legalEntity.paymentRouting?.bank?.intermediaryBank?.SWIFT ?? null,
    IBAN: legalEntity.paymentRouting?.bank?.IBAN ?? null,
    IBANIntermediary:
      legalEntity.paymentRouting?.bank?.intermediaryBank?.IBAN ?? null,
    ABA: legalEntity.paymentRouting?.bank?.ABA ?? null,
    ABAIntermediary:
      legalEntity.paymentRouting?.bank?.intermediaryBank?.ABA ?? null,
    accountType: legalEntity.paymentRouting?.bank?.accountType ?? null,
    accountTypeIntermediary:
      legalEntity.paymentRouting?.bank?.intermediaryBank?.accountType ?? null,
    city: legalEntity.paymentRouting?.bank?.address.city ?? null,
    cityIntermediary:
      legalEntity.paymentRouting?.bank?.intermediaryBank?.address.city ?? null,
    country: legalEntity.paymentRouting?.bank?.address.country ?? null,
    countryIntermediary:
      legalEntity.paymentRouting?.bank?.intermediaryBank?.address.country ??
      null,
    extendedAddress:
      legalEntity.paymentRouting?.bank?.address.extendedAddress ?? null,
    extendedAddressIntermediary:
      legalEntity.paymentRouting?.bank?.intermediaryBank?.address
        .extendedAddress ?? null,
    postalCode: legalEntity.paymentRouting?.bank?.address.postalCode ?? null,
    postalCodeIntermediary:
      legalEntity.paymentRouting?.bank?.intermediaryBank?.address.postalCode ??
      null,
    stateProvince:
      legalEntity.paymentRouting?.bank?.address.stateProvince ?? null,
    stateProvinceIntermediary:
      legalEntity.paymentRouting?.bank?.intermediaryBank?.address
        .stateProvince ?? null,
    streetAddress:
      legalEntity.paymentRouting?.bank?.address.streetAddress ?? null,
    streetAddressIntermediary:
      legalEntity.paymentRouting?.bank?.intermediaryBank?.address
        .streetAddress ?? null,
    memo: legalEntity.paymentRouting?.bank?.memo ?? null,
    memoIntermediary:
      legalEntity.paymentRouting?.bank?.intermediaryBank?.memo ?? null,
    name: legalEntity.paymentRouting?.bank?.name ?? null,
    nameIntermediary:
      legalEntity.paymentRouting?.bank?.intermediaryBank?.name ?? null,
  };

  return (
    <div className="space-y-8">
      {!basicInfoDisabled && !!onChangeInfo && (
        <LegalEntityBasicInput onChange={onChangeInfo} value={basicInfo} />
      )}
      {!bankDisabled && !!onChangeBank && (
        <LegalEntityBankInput onChange={onChangeBank} value={bankInfo} />
      )}
    </div>
  );
}
