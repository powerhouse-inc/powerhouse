import { FormInput } from "#connect";
import { EthereumAddress as EthereumAddressScalar } from "@powerhousedao/scalars";
import { useState } from "react";

export interface EthereumAddressProps {
  onChange?: (address: string, isValidAddress: boolean) => void;
}

export const EthereumAddress: React.FC<EthereumAddressProps> = ({
  onChange,
}) => {
  const [address, setAddress] = useState("");

  const result = EthereumAddressScalar.schema.safeParse(address);

  const errors = result.error?.errors.map((error) => error.message).join(", ");

  if (onChange) {
    onChange(address, result.success);
  }

  return (
    <div>
      <FormInput
        id="eth-address-input"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="0x...."
      />
      <label htmlFor="eth-address-input">{address !== "" && errors}</label>
    </div>
  );
};
