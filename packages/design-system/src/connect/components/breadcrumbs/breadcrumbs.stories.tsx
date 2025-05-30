import { UiNodesContextProvider } from "@powerhousedao/reactor-browser";
import { type Meta, type StoryObj } from "@storybook/react";
import { Breadcrumbs } from "./index.js";

const meta: Meta<typeof Breadcrumbs> = {
  title: "Connect/Components/Breadcrumbs",
  component: Breadcrumbs,
  decorators: [
    (Story, { args }) => {
      return (
        <UiNodesContextProvider>
          <Story {...args} />
        </UiNodesContextProvider>
      );
    },
  ],
};

export default meta;

type Story = StoryObj<typeof Breadcrumbs>;

export const Default: Story = {
  args: {
    createEnabled: true,
  },
  render: function Wrapper(args) {
    return (
      <div className="bg-white p-10">
        <Breadcrumbs {...args} />
      </div>
    );
  },
};

export const NotAllowedToCreateDocuments: Story = {
  ...Default,
  args: {
    ...Default.args,
    createEnabled: false,
  },
};
