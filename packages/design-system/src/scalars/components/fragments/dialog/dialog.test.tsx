import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Dialog } from "./dialog";

describe("Dialog Component", () => {
  it("should match snapshot", () => {
    const { asFragment } = render(<Dialog />);
    expect(asFragment()).toMatchSnapshot();
  });
});
