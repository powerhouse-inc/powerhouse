import type { IconName } from "#powerhouse";
import type React from "react";

export interface Currency {
  ticker: string;
  crypto: boolean;
  label?: string;
  symbol?: string;
  icon?: IconName | React.ComponentType<{ className?: string }>;
}

export type AllowedTypes = "Crypto" | "Fiat" | "Both";
