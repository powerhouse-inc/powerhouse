/* eslint-disable react-hooks/rules-of-hooks */
import { Decorator } from "@storybook/react";
import { Checkbox, Form } from "../components";
import { Button } from "@/powerhouse";
import { useState, useId, useCallback, useRef } from "react";
import { UseFormReturn } from "react-hook-form";

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
  const [resetCount, setResetCount] = useState<number>(0); // Nuevo estado para forzar remontaje
  const checkboxId = useId();
  const { viewMode, parameters } = context;
  const isDocs = viewMode === "docs";

  const onSubmit = useCallback((data: any) => {
    const serializedData = JSON.stringify(
      data,
      (key, value): any =>
        typeof value === "bigint" ? `BigInt(${value.toString()})` : value,
      2,
    );

    setTimeout(() => {
      alert(serializedData);
    }, 300);
  }, []);

  const onReset = useCallback(() => {
    formRef.current?.reset();
    setResetCount((prev) => prev + 1); // Incrementar contador para nuevo key
  }, []);

  const onShowFormButtonsChange = useCallback((checked: boolean) => {
    setShowFormButtons(checked);
  }, []);

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

  const defaultValues = (parameters as StoryFormParameters).form?.defaultValues;

  return (
    <div key={`${context.id}-${resetCount}`}>
      {/* Key única por reset */}
      <Form ref={formRef} onSubmit={onSubmit} defaultValues={defaultValues}>
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
