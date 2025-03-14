import { type ComponentType, type ReactNode } from "react";
import { twJoin } from "tailwind-merge";

type Input = {
  label: string;
  Input: ComponentType;
  inputLabel?: ReactNode;
};
type Props = {
  readonly inputs: Input[];
};
export function FormInputs(props: Props) {
  const { inputs } = props;
  return (
    <div className="rounded-md bg-white text-xs font-medium">
      {inputs.map(({ label, Input, inputLabel }, index) => (
        <div
          className={twJoin(
            "grid min-h-11 grid-cols-[208px,380px] items-center px-6 text-gray-600 last:rounded-b-md",
            index % 2 !== 0 && "bg-gray-50",
          )}
          key={label}
        >
          <div>{label}</div>
          <div className="h-max py-2 text-gray-900" key={index}>
            <Input />
            {inputLabel ? (
              <div className="text-left text-gray-500">{inputLabel}</div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
