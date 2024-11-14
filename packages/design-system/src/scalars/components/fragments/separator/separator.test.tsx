import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Separator } from "./separator";

describe("Separator Component", () => {
  it("should match snapshot", () => {
    const { asFragment } = render(<Separator />);
    expect(asFragment()).toMatchSnapshot();
  });
});
