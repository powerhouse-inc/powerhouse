import { type RealWorldAssetsState } from "../types";
import {
  mockAccounts,
  mockCashAsset,
  mockFixedIncomeTypes,
  mockFixedIncomes,
  mockPrincipalLenderAccountId,
  mockSPVs,
  mockServiceProviderFeeTypes,
} from "./assets";
import { mockGroupTransactions } from "./transactions";

export const mockStateInitial: RealWorldAssetsState = {
  accounts: [],
  principalLenderAccountId: mockPrincipalLenderAccountId,
  serviceProviderFeeTypes: [],
  transactions: [],
  fixedIncomeTypes: [],
  portfolio: [mockCashAsset],
  spvs: [],
};

export const mockStateWithData: RealWorldAssetsState = {
  accounts: mockAccounts,
  principalLenderAccountId: mockPrincipalLenderAccountId,
  serviceProviderFeeTypes: mockServiceProviderFeeTypes,
  transactions: mockGroupTransactions,
  fixedIncomeTypes: mockFixedIncomeTypes,
  portfolio: [mockCashAsset, ...mockFixedIncomes],
  spvs: mockSPVs,
};
