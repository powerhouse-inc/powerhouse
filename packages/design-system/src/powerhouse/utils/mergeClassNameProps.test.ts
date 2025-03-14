import { mergeClassNameProps } from "./mergeClassNameProps.js";
import { it } from "vitest";
describe("Utils", () => {
  describe("mergeClassNameProps", () => {
    it("should inlcude className argument value as part of the returned props", () => {
      const props = mergeClassNameProps({}, "test-class-name");
      expect(props.className).toBe("test-class-name");
    });

    it("should return merged props with argument className value", () => {
      const baseProps = {
        prop1: "prop1",
        prop2: "prop2",
        className: undefined,
      };

      const props = mergeClassNameProps(baseProps, "test-class-name");

      expect(props.prop1).toBe("prop1");
      expect(props.prop2).toBe("prop2");
      expect(props.className).toBe("test-class-name");
    });

    it("should return merged props with className prop and className argument", () => {
      const baseProps = {
        prop1: "prop1",
        prop2: "prop2",
        className: "class1",
      };

      const props = mergeClassNameProps(baseProps, "test-class-name");

      expect(props.prop1).toBe("prop1");
      expect(props.prop2).toBe("prop2");
      expect(props.className).toBe("test-class-name class1");
    });

    it("should omit className fn prop", () => {
      const baseProps = {
        prop1: "prop1",
        prop2: "prop2",
        className: () => "class1",
      };

      const props = mergeClassNameProps(baseProps, "test-class-name");

      expect(props.prop1).toBe("prop1");
      expect(props.prop2).toBe("prop2");
      expect(props.className).toBe("test-class-name");
    });
  });
});
