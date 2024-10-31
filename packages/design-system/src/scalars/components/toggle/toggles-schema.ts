import { z } from "zod";

export const formSchema = z
  .object({
    checked: z.boolean().optional(),
    required: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.checked && data.required !== true) {
        return false;
      }
      return true;
    },
    {
      message: "This field its requiere",
      path: ["checked"],
    },
  );

export const validateRequiredField = (required: boolean, checked: boolean) => {
  const validations = formSchema.safeParse({ required, checked });
  return validations.success
    ? []
    : validations.error.errors.map((e) => e.message);
};
