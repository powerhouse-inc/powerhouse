import type { ActionOutputFor } from "@powerhousedao/design-system";
import {
  mockAccounts,
  mockFixedIncomes,
  mockFixedIncomeTypes,
  mockGroupTransactions,
  mockServiceProviderFeeTypes,
  mockSPVs,
  mockStateInitial,
  mockStateWithData,
  RWAEditor,
  RWAEditorContextProvider,
} from "@powerhousedao/design-system";
import type { Meta, StoryObj } from "@storybook/react";
import type { ComponentPropsWithoutRef } from "react";
import { useState } from "react";
import { useInterval } from "usehooks-ts";

const meta: Meta<typeof RWAEditor> = {
  title: "RWA/Components/Editor",
  component: RWAEditor,
};

export default meta;

type Story = StoryObj<
  ComponentPropsWithoutRef<typeof RWAEditorContextProvider> & {
    simulateBackgroundUpdates: boolean;
    backgroundUpdateRate: number;
  }
>;

export const WithoutData: Story = {
  args: {
    simulateBackgroundUpdates: false,
    backgroundUpdateRate: 3000,
    state: mockStateInitial,
    isAllowedToCreateDocuments: true,
    isAllowedToEditDocuments: true,
    canUndo: true,
    canRedo: true,
    onSwitchboardLinkClick: undefined,
    onExport: () => {},
    onClose: () => {},
    onShowRevisionHistory: () => {},
    editorDispatcher: (action) => {
      console.log(action);
      return undefined as unknown as ActionOutputFor<typeof action>;
    },
  },
  render: function Wrapper(args) {
    const [state, setState] = useState(args.state);
    useInterval(
      () => {
        setState((prev) => ({
          ...prev,
          accounts: [
            ...prev.accounts,
            {
              ...mockAccounts[1],
              id: `new-${Date.now()}`,
            },
          ],
          portfolio: [
            ...prev.portfolio,
            { ...mockFixedIncomes[0], id: `new-${Date.now()}` },
          ],
          transactions: [
            ...prev.transactions,
            {
              ...mockGroupTransactions()[0],
              id: `new-${Date.now()}`,
            },
          ],
          fixedIncomeTypes: [
            ...prev.fixedIncomeTypes,
            {
              ...mockFixedIncomeTypes[0],
              id: `new-${Date.now()}`,
            },
          ],
          spvs: [...prev.spvs, { ...mockSPVs[0], id: `new-${Date.now()}` }],
          serviceProviderFeeTypes: [
            ...prev.serviceProviderFeeTypes,
            {
              ...mockServiceProviderFeeTypes[0],
              id: `new-${Date.now()}`,
            },
          ],
        }));
      },
      args.simulateBackgroundUpdates ? args.backgroundUpdateRate : null,
    );
    return (
      <RWAEditorContextProvider {...args} state={state}>
        <RWAEditor />
      </RWAEditorContextProvider>
    );
  },
};

export const WithData: Story = {
  ...WithoutData,
  args: {
    ...WithoutData.args,
    state: mockStateWithData,
  },
};

export const NotAllowedToCreateDocuments: Story = {
  ...WithData,
  args: {
    ...WithData.args,
    isAllowedToCreateDocuments: false,
  },
};

export const NotAllowedToEditDocuments: Story = {
  ...WithData,
  args: {
    ...WithData.args,
    isAllowedToEditDocuments: false,
  },
};

export const NotAllowedToCreateOrEditDocuments: Story = {
  ...WithData,
  args: {
    ...WithData.args,
    isAllowedToCreateDocuments: false,
    isAllowedToEditDocuments: false,
  },
};

export const WithManyItems: Story = {
  ...WithData,
  args: {
    ...WithData.args,
    state: {
      principalLenderAccountId: mockStateWithData.principalLenderAccountId,
      accounts: [
        ...mockStateWithData.accounts,
        ...Array.from({ length: 100 }, (_, i) => ({
          ...mockStateWithData.accounts[1],
          id: `new-${i}`,
        })),
      ],
      portfolio: [
        ...mockStateWithData.portfolio,
        ...Array.from({ length: 100 }, (_, i) => ({
          ...mockFixedIncomes[0],
          id: `new-${i}`,
        })),
      ],
      transactions: [
        ...mockStateWithData.transactions,
        ...Array.from({ length: 100 }, (_, i) => ({
          ...mockGroupTransactions()[0],
          id: `new-${i}`,
        })),
      ],
      fixedIncomeTypes: [
        ...mockStateWithData.fixedIncomeTypes,
        ...Array.from({ length: 100 }, (_, i) => ({
          ...mockFixedIncomeTypes[0],
          id: `new-${i}`,
        })),
      ],
      spvs: [
        ...mockStateWithData.spvs,
        ...Array.from({ length: 100 }, (_, i) => ({
          ...mockSPVs[0],
          id: `new-${i}`,
        })),
      ],
      serviceProviderFeeTypes: [
        ...mockStateWithData.serviceProviderFeeTypes,
        ...Array.from({ length: 100 }, (_, i) => ({
          ...mockServiceProviderFeeTypes[0],
          id: `new-${i}`,
        })),
      ],
    },
  },
};
