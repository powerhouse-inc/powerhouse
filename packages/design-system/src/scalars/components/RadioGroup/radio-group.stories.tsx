import type { Meta, StoryObj } from "@storybook/react";
import { RadioGroup, RadioGroupItem } from "./radio-group";
import { useState } from "react";

const meta: Meta<typeof RadioGroup> = {
  title: "Document Engineering/Simple Components/RadioGroup",
  component: RadioGroup,
  argTypes: {
    disabled: {
      control: {
        type: "boolean",
      },
    },
    className: {
      control: {
        type: "text",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const RadioGroupWithDynamicOptions = ({
  initialOptions = ["Option 1", "Option 2"],
}) => {
  const [options, setOptions] = useState(initialOptions);

  const addOption = () => {
    setOptions([...options, `Option ${options.length + 1}`]);
  };

  const removeOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index));
  };

  return (
    <div>
      <RadioGroup>
        {options.map((option, index) => (
          <div key={index} className="flex items-center space-x-2">
            <RadioGroupItem value={option} id={`option-${index}`} />
            <label htmlFor={`option-${index}`}>{option}</label>
            <button onClick={() => removeOption(index)}>Remove</button>
          </div>
        ))}
      </RadioGroup>
      <button onClick={addOption}>Add Option</button>
    </div>
  );
};

export const Default: Story = {
  render: () => <RadioGroupWithDynamicOptions />,
};

export const WithMoreInitialOptions: Story = {
  render: () => (
    <RadioGroupWithDynamicOptions
      initialOptions={["Red", "Green", "Blue", "Yellow", "Purple"]}
    />
  ),
};

export const Disabled: Story = {
  render: () => (
    <RadioGroup disabled>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option1" id="option1" />
        <label htmlFor="option1">Option 1</label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option2" id="option2" />
        <label htmlFor="option2">Option 2</label>
      </div>
    </RadioGroup>
  ),
};
