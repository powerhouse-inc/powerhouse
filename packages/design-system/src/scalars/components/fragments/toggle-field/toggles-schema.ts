import { z } from "zod";

export const formSchema = z
  .object({
    checked: z.boolean().optional(),
    required: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.required && !data.checked) {
        return false;
      }
      return true;
    },
    {
      message: "This field is required.",
      path: ["checked"],
    },
  );

export const validateRequiredField = (required: boolean, checked: boolean) => {
  // Run validation with the updated schema
  const validations = formSchema.safeParse({ required, checked });
  return validations.success
    ? []
    : validations.error.errors.map((e) => e.message);
};
