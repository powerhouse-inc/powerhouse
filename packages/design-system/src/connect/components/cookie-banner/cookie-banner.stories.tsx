import { type Meta, type StoryObj } from "@storybook/react";
import { CookieBanner } from "./cookie-banner.js";

const meta = {
  title: "Connect/Components/CookieBanner",
  component: CookieBanner,
  argTypes: {
    submitLabel: { control: { type: "text" } },
    rejectLabel: { control: { type: "text" } },
    onSubmit: { action: "submit" },
    onReject: { action: "reject" },
    cookies: { control: { type: "object" } },
  },
} satisfies Meta<typeof CookieBanner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    submitLabel: "Accept configured cookies",
    rejectLabel: "Reject all cookies",
    children: (
      <div className="font-semibold text-gray-500">
        This website uses cookies for analytic purposes only. Cookies are
        anonymous and do not link to user data. We collect information to
        improve the user experience and validate UI changes. You can still use
        the page without cookies. For more information, please read our{" "}
        <span className="text-gray-900">cookies policy.</span>
      </div>
    ),
    cookies: [
      {
        id: "functional-cookies",
        label: "Functional cookies",
        value: false,
      },
      {
        id: "analytics-cookie",
        label: "Analytics cookies",
        value: true,
      },
    ],
  },
};
