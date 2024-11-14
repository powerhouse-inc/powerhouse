import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Button } from "./button";

describe("Button Component", () => {
  it("should match snapshot", () => {
    const { asFragment } = render(<Button />);
    expect(asFragment()).toMatchSnapshot();
  });
});
