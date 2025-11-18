import type { RenderResult } from "@testing-library/react";
import { render } from "@testing-library/react";
import { Form } from "../components/form/form.js";

export const renderWithForm = (
  children: React.ReactNode,
  onSubmit?: () => void,
): RenderResult => {
  return render(children, {
    wrapper: ({ children }) => (
      <Form onSubmit={onSubmit ?? (() => null)}>{children}</Form>
    ),
  });
};
