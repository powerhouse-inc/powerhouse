import { isAddress } from "viem";
import { AIDInput } from "../../../ui/components/data-entry/aid-input/index.js";
import { withFieldValidation } from "../fragments/with-field-validation/index.js";
import type { AIDFieldProps } from "./types.js";

const AIDField = withFieldValidation<AIDFieldProps>(AIDInput, {
  validations: {
    _validAIDFormat:
      ({ supportedNetworks }) =>
      (value: string | undefined) => {
        if (value === "" || value === undefined) {
          return true;
        }

        // Basic DID format validation
        if (!value.startsWith("did:ethr:")) {
          return "Invalid DID format. Must start with did:ethr:";
        }

        // Validate DID parts
        const didParts = value.split(":");
        if (didParts.length < 3 || didParts.length > 4) {
          return "Invalid DID format. Must be in the format did:ethr:chainId:address (chainId is optional)";
        }

        // Validate chainId
        if (didParts.length === 4) {
          const chainId = didParts[2];

          if (!/^0x[0-9a-fA-F]+$/.test(chainId)) {
            return "Invalid chainId format. Must be a hexadecimal number with 0x prefix";
          }

          if (Array.isArray(supportedNetworks)) {
            if (
              !supportedNetworks.some((network) => network.chainId === chainId)
            ) {
              return `Invalid chainId. Allowed chainIds are: ${supportedNetworks
                .map((network) => network.chainId)
                .join(", ")}`;
            }
          }
        }

        // Extract Ethereum address
        const address = didParts[didParts.length - 1];

        // Validate basic Ethereum address format
        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
          return "Invalid Ethereum address format. Must be a 40 character hexadecimal number with 0x prefix.";
        }

        // Validate checksum
        if (!isAddress(address)) {
          return "Invalid Ethereum address checksum.";
        }

        return true;
      },
  },
});

AIDField.displayName = "AIDField";

export { AIDField };
