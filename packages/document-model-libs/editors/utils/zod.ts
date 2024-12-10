import { z } from "zod";

export const dateValidator = z.coerce.date();

export const numberValidator = z.number();

export function makeUniqueStringValidator(
  stringsToCheck: string[],
  message?: string,
) {
  return z.string().refine((s) => !stringsToCheck.includes(s), {
    message: message ?? "Item already exists",
  });
}

export function makeStringExistsValidator(
  stringsToCheck: string[],
  message?: string,
) {
  return z.string().refine((s) => stringsToCheck.includes(s), {
    message: message ?? "Item does not exist exist",
  });
}

export function makeStringEqualsValidator(
  stringToCheck: string,
  message?: string,
) {
  return z.string().refine((s) => s === stringToCheck, {
    message: message ?? "String does not match",
  });
}
