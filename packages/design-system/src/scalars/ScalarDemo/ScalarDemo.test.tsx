import { render } from "@testing-library/react";

import { ScalarDemo } from "./ScalarDemo";

describe("ScalarDemo Component", () => {
  it("should match snapshot", () => {
    const { asFragment } = render(<ScalarDemo name="test" />);

    expect(asFragment()).toMatchSnapshot();
  });
});
