import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Popover } from "./popover.js";

describe("Popover Component", () => {
  it("should match snapshot", () => {
    const { asFragment } = render(<Popover />);
    expect(asFragment()).toMatchSnapshot();
  });
});
