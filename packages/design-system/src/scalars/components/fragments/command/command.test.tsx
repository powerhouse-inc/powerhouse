import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Command } from "./command.js";

describe("Command Component", () => {
  it("should match snapshot", () => {
    const { asFragment } = render(<Command />);
    expect(asFragment()).toMatchSnapshot();
  });
});
