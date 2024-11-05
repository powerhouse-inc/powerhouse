import { Decorator } from "@storybook/react";
import { Form } from "../components/fragments";

export const withForm: Decorator = (Story) => {
  const onSubmit = (data: any) => {
    alert(JSON.stringify(data, null, 2));
  };

  return (
    <Form onSubmit={onSubmit}>
      <Story />
    </Form>
  );
};
