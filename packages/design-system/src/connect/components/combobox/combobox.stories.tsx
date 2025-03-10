import { type Meta, type StoryObj } from "@storybook/react";
import { Combobox } from "./combobox";

const meta = {
  title: "Connect/Components/Combobox",
  component: Combobox,
} satisfies Meta<typeof Combobox>;

export default meta;

type Story = StoryObj<typeof meta>;

const options = [
  {
    label: "FixedIncome 2703",
    value: "137418",
  },
  {
    label: "FixedIncome 6345 - 807597117063 - 303442336",
    value: "683189",
  },
  {
    label: "FixedIncome 1369 - 466394625668 - 319580691",
    value: "752165",
  },
  {
    label: "FixedIncome 6762 - 899255020782 - 081390248",
    value: "472706",
  },
  {
    label: "FixedIncome 4764 - 289378983334 - 611105546",
    value: "852793",
  },
  {
    label: "FixedIncome 3377 - 581535993415 - 638814162",
    value: "704871",
  },
  {
    label: "FixedIncome 4552 - 957822646500 - 420251643",
    value: "117828",
  },
  {
    label: "FixedIncome 4053 - 681711139048 - 662382150",
    value: "023427",
  },
  {
    label: "FixedIncome 8136 - 920909997265 - 013733367",
    value: "637391",
  },
  {
    label: "FixedIncome 0761 - 325463008815 - 273954713",
    value: "269772",
  },
];

export const Default: Story = {
  args: {
    options,
  },
};

export const WithAddItemButton: Story = {
  ...Default,
  args: {
    ...Default.args,
    addItemButtonProps: {
      label: "Add New Item",
      onClick: () => {
        alert("Add Item");
      },
    },
  },
};
