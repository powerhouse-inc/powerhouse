import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Badge } from "./badge";

describe("Badge Component", () => {
  it("should match snapshot", () => {
    const { asFragment } = render(<Badge />);
    expect(asFragment()).toMatchSnapshot();
  });
});
