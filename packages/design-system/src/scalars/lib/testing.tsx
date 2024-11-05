import { render, RenderResult } from "@testing-library/react";
import { Form } from "../components/fragments";

export const renderWithForm = (children: React.ReactNode): RenderResult => {
  return render(children, {
    wrapper: ({ children }) => <Form onSubmit={() => null}>{children}</Form>,
  });
};
