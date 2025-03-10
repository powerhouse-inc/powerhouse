/* eslint-disable react-hooks/rules-of-hooks */
import { type Decorator } from "@storybook/react";
import { Checkbox, Form } from "../components";
import { Button } from "#powerhouse";
import { useState, useId } from "react";
import { useCallback } from "react";
import { useRef } from "react";
import { type UseFormReturn } from "react-hook-form";
import React from "react";
import { type Args, type DecoratorFunction } from "@storybook/types";

function _isValidRegex(pattern: unknown): boolean {
  try {
    new RegExp(pattern as string);
    return true;
  } catch {
    return false;
  }
}

interface StoryFormParameters {
  form?: {
    defaultValues?: Record<string, any>;
  };
}

export const withForm: Decorator = (Story, context) => {
  const formRef = useRef<UseFormReturn>(null);
  const [showFormButtons, setShowFormButtons] = useState<boolean>(false);
  const checkboxId = useId();
  const { viewMode, parameters } = context;
  const isDocs = viewMode === "docs";

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
        (parameters as StoryFormParameters).form?.defaultValues?.[fieldName] ??
          "",
      ]),
    );
    formRef.current?.reset(defaultValues);
  }, [parameters]);

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

        {showFormButtons || isDocs ? (
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

      {!isDocs && (
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

export const withTimestampsAsISOStrings: DecoratorFunction<any> = (
  Story,
  context,
) => {
  const { args } = context;

  // Function to convert timestamps to Date objects
  const convertTimestampsToDates = (args: Args) => {
    const newArgs = { ...args };

    // Iterate through all args properties
    Object.keys(newArgs).forEach((key) => {
      const value = newArgs[key] as unknown;

      // If the value is a number and looks like a timestamp (milliseconds since 1970)
      if (typeof value === "number" && value > 1609459200000) {
        newArgs[key] = new Date(value).toISOString();
      }
    });

    return newArgs;
  };
  const convertedArgs = convertTimestampsToDates(args);

  return <Story {...context} args={convertedArgs} />;
};
