import { FormInput } from "#connect";
import { EthereumAddress as EthereumAddressScalar } from "@powerhousedao/scalars";
import { withScalar, type BaseScalarFieldProps } from "./ScalarField.js";

export type EthereumAddressProps = BaseScalarFieldProps<
  typeof EthereumAddressScalar
>;

export const BaseEthereumAddress = ({
  value,
  onChange,
  error,
}: EthereumAddressProps) => {
  return (
    <div>
      <FormInput
        id="eth-address-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0x...."
      />
      <label htmlFor="eth-address-input">{error ? error.message : value}</label>
    </div>
  );
};

export const EthereumAddress = withScalar(
  EthereumAddressScalar,
  BaseEthereumAddress,
);
