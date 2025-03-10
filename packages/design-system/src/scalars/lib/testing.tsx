import { render, type RenderResult } from "@testing-library/react";
import { Form } from "#scalars";

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
