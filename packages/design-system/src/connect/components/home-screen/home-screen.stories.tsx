import Hdd from "@/assets/icon-components/Hdd";
import M from "@/assets/icon-components/M";
import PowerhouseLogoSmall from "@/assets/icon-components/PowerhouseLogoSmall";
import { Meta, StoryObj } from "@storybook/react";
import { HomeScreenItem } from "../home-screen-item";
import { HomeScreen } from "./home-screen";

const meta = {
  title: "Connect/Components/Home Screen",
  component: HomeScreen,
} satisfies Meta<typeof HomeScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

const Template: Story = {
  args: {
    children: <div className="mx-auto flex flex-row gap-4"></div>,
  },
  render: () => (
    <HomeScreen>
      <HomeScreenItem
        title="My Drive"
        description="Drive Explorer App"
        icon={<Hdd width={32} height={32} />}
      />
      <HomeScreenItem
        title="Maker"
        description="Drive Explorer App"
        sharable
        icon={<M width={32} height={32} />}
      />
      <HomeScreenItem
        title="Powerhouse Genesis"
        description="OH Admin App"
        icon={<PowerhouseLogoSmall width={32} height={32} />}
      />
      <HomeScreenItem title="Frank Inc." description="Contributor App" />
      <HomeScreenItem
        title="Powerhouse Genesis"
        description="POH Admin App"
        icon={<PowerhouseLogoSmall width={32} height={32} />}
      />
    </HomeScreen>
  ),
};

export const Default: Story = {
  ...Template,
};
