/* eslint-disable react-hooks/rules-of-hooks */
import { Decorator } from "@storybook/react";
import { Checkbox, Form } from "../components";
import { Button } from "@/powerhouse";
import { useState, useId } from "react";
import { useCallback } from "react";
import { useRef } from "react";
import { UseFormReturn } from "react-hook-form";

function _isValidRegex(pattern: unknown): boolean {
  try {
    new RegExp(pattern as string);
    return true;
  } catch {
    return false;
  }
}

export const withForm: Decorator = (Story, context) => {
  const formRef = useRef<UseFormReturn>(null);
  const [showFormButtons, setShowFormButtons] = useState<boolean>(false);
  const checkboxId = useId();
  const { viewMode } = context;

  const onSubmit = useCallback((data: any) => {
    // Allow to show bigInt values in the alert
    const serializedData = JSON.stringify(
      data,
      (key, value): any =>
        typeof value === "bigint" ? `BigInt(${value.toString()})` : value,
      2,
    );

    // delay the alert to allow component JS to finish the execution
    setTimeout(() => {
      alert(serializedData);
    }, 300);
  }, []);

  const onReset = useCallback(() => {
    // reset only works if the form has default values to reset to
    // so as this is a generic decorator, we need to build the default values
    // from the control fields. This is not how the reset is going to be used
    // in the real world, but it's good enough for the storybook
    const defaultValues = Object.fromEntries(
      Object.keys(formRef.current?.control._fields ?? {}).map((fieldName) => [
        fieldName,
        "",
      ]),
    );
    formRef.current?.reset(defaultValues);
  }, []);

  const onShowFormButtonsChange = useCallback((checked: boolean) => {
    setShowFormButtons(checked);
  }, []);

  // override the warnings in the args to avoid breaking the storybook
  // as storybook set by default an object instead of an array
  const overrideArgs = {
    ...context.args,
    ...(Array.isArray(context.args.warnings)
      ? { warnings: context.args.warnings }
      : { warnings: undefined }),
    ...(context.args.pattern !== undefined
      ? _isValidRegex(context.args.pattern)
        ? { pattern: context.args.pattern }
        : { pattern: "" }
      : {}),
  };

  return (
    <div>
      <Form ref={formRef} onSubmit={onSubmit}>
        <Story args={overrideArgs} />

        {showFormButtons ? (
          <div className="flex gap-2">
            <Button
              className="mt-4 w-full"
              color="light"
              type="reset"
              onClick={onReset}
            >
              Reset
            </Button>
            <Button className="mt-4 w-full" color="dark" type="submit">
              Submit
            </Button>
          </div>
        ) : (
          // allow to "submit" the form from the story
          // it is needed as some browsers do not submit on Enter key press when there're several inputs and no submit button
          <input type="submit" className="hidden" />
        )}
      </Form>

      {viewMode !== "docs" && (
        <div className="absolute bottom-5 right-5 z-50">
          <div className="flex items-center gap-2">
            <Checkbox
              id={checkboxId}
              checked={showFormButtons}
              onCheckedChange={onShowFormButtonsChange}
            />
            <label
              className="cursor-pointer dark:text-gray-400"
              htmlFor={checkboxId}
            >
              Show form buttons
            </label>
          </div>
        </div>
      )}
    </div>
  );
};
