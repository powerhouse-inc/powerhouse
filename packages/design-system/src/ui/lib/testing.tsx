import { Form } from "@powerhousedao/design-system";
import type { RenderResult } from "@testing-library/react";
import { render } from "@testing-library/react";

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
