import { Meta, StoryObj } from "@storybook/react";
import { twJoin } from "tailwind-merge";
import twConfig from "../../../tailwind.config";

const meta = {
  title: "Powerhouse/Style Guide",
} satisfies Meta;

export default meta;

export const Colors: StoryObj<typeof meta> = {
  render: function Wrapper() {
    return (
      <div className="mx-auto flex max-w-[650px] flex-wrap gap-1 bg-white p-6">
        {Object.keys(twConfig.theme.extend.colors).map((key) => {
          const colorVar = `--${key}`;

          return (
            <div
              className="grid aspect-square w-[30%] max-w-[200px] place-items-center"
              key={key}
              style={{ backgroundColor: `var(${colorVar})` }}
            >
              <div className="bg-white p-1 text-xs">{key}</div>
            </div>
          );
        })}
      </div>
    );
  },
};

export const TextSizes: StoryObj<typeof meta> = {
  render: function Wrapper() {
    const textSizes = [
      "text-xs",
      "text-sm",
      "text-base",
      "text-lg",
      "text-xl",
      "text-2xl",
      "text-3xl",
      "text-4xl",
      "text-5xl",
    ];

    return (
      <div className="mx-auto flex max-w-[650px] flex-wrap gap-1 bg-white p-6">
        {textSizes.map((key) => {
          return (
            <p className={twJoin(key, "mb-2")} key={key}>
              {key} — Lorem ipsus dolor amet
            </p>
          );
        })}
      </div>
    );
  },
};
