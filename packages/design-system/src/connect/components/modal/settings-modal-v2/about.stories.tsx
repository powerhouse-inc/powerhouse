import { type Meta, type StoryObj } from "@storybook/react";
// @ts-expect-error - json file needs { with: "json" } but storybook doesn't support it
import mockPackageJson from "../../../utils/mocks/mock-package-json.json";
import { About } from "./about.js";
const meta: Meta<typeof About> = {
  title: "Connect/Components/Modal/SettingsModalV2/About",
  component: About,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    packageJson: mockPackageJson,
  },
};

export const WithPhCliVersion: Story = {
  args: {
    packageJson: mockPackageJson,
    phCliVersion: "1.0.0",
  },
};
