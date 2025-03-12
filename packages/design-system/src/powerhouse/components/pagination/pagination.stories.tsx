import type { Meta, StoryObj } from "@storybook/react";
import { Pagination } from "./pagination.js";

const meta: Meta<typeof Pagination> = {
  title: "Powerhouse/Components/Pagination",
  component: Pagination,
  argTypes: {
    pages: { control: "object" },
    goToFirstPage: { action: "goToFirstPage" },
    goToLastPage: { action: "goToLastPage" },
    goToNextPage: { action: "goToNextPage" },
    goToPage: { action: "goToPage" },
    goToPreviousPage: { action: "goToPreviousPage" },
    hiddenNextPages: { control: "boolean" },
    isNextPageAvailable: { control: "boolean" },
    isPreviousPageAvailable: { control: "boolean" },
    previousPageLabel: { control: "text" },
    nextPageLabel: { control: "text" },
    firstPageLabel: { control: "text" },
    lastPageLabel: { control: "text" },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    previousPageLabel: "Previous",
    nextPageLabel: "Next",
    firstPageLabel: "First",
    lastPageLabel: "Last",
    hiddenNextPages: true,
    isNextPageAvailable: true,
    isPreviousPageAvailable: true,
    pages: [
      {
        active: false,
        index: 0,
        number: 1,
      },
      {
        active: false,
        index: 1,
        number: 2,
      },
      {
        active: true,
        index: 2,
        number: 3,
      },
      {
        active: false,
        index: 3,
        number: 4,
      },
      {
        active: false,
        index: 4,
        number: 5,
      },
    ],
  },
};
