import { Icon } from "@/powerhouse";
import { type Meta, type StoryObj } from "@storybook/react";
import { Footer } from "./footer";
import { FooterLink } from "./footer-link";

const meta = {
  title: "Connect/Components/Footer",
  component: Footer,
  argTypes: {
    children: { control: { type: "text" } },
  },
} satisfies Meta<typeof Footer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <>
        <FooterLink>Cookie Policy</FooterLink>
        <FooterLink>Terms of Use</FooterLink>
        <FooterLink>Disclaimer</FooterLink>
        <FooterLink>
          Built with
          <Icon className="mx-1" name="PowerhouseLogoSmall" size={16} />
          Powerhouse
        </FooterLink>
      </>
    ),
  },
};
