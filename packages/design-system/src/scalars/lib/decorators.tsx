import { Decorator } from "@storybook/react";
import { Form } from "../components/fragments";

export const withForm: Decorator = (Story) => {
  const onSubmit = (data: any) => {
    alert(JSON.stringify(data, null, 2));
  };

  return (
    <Form onSubmit={onSubmit}>
      <Story />

      {/* allow to "submit" the form from the story */}
      {/* it is needed as some browsers do not submit on Enter key press when there're several inputs and no submit button */}
      <input type="submit" className="hidden" />
    </Form>
  );
};
