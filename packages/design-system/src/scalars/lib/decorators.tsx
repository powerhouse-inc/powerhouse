import { Decorator } from "@storybook/react";
import { Checkbox, Form } from "../components";
import { Button } from "@/powerhouse";
import { useState, useId } from "react";

export const withForm: Decorator = (Story, context) => {
  const [showFormButtons, setShowFormButtons] = useState<boolean>(false);
  const checkboxId = useId();
  const { viewMode } = context;

  const onSubmit = (data: any) => {
    alert(JSON.stringify(data, null, 2));
  };

  return (
    <div>
      <Form onSubmit={onSubmit}>
        {({ reset }) => (
          <>
            <Story />

            {showFormButtons ? (
              <div className="flex gap-2">
                <Button
                  className="mt-4 w-full"
                  color="light"
                  type="reset"
                  onClick={reset}
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
          </>
        )}
      </Form>

      {viewMode !== "docs" && (
        <div className="absolute bottom-5 right-5 z-50">
          <div className="flex items-center gap-2">
            <Checkbox
              id={checkboxId}
              checked={showFormButtons}
              onCheckedChange={(checked) =>
                setShowFormButtons(checked as boolean)
              }
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
