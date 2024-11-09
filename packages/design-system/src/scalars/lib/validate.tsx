import { ValidatorHandler } from "../components/types";

interface ValidationRules {
  pattern?: RegExp;
  maxLength?: number;
  minLength?: number;
  customValidator?: ValidatorHandler;
  extraValidation?: {
    [key: string]: ValidatorHandler;
  };
}

// Debounce utility function
function debounce(func: (...args: any[]) => void, wait: number) {
  let timeout: NodeJS.Timeout;
  return function (...args: any[]) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Validation function
async function validateValue(
  value: string,
  rules: ValidationRules,
): Promise<true | string | string[]> {
  const errors: string[] = [];

  if (rules.pattern && !rules.pattern.test(value)) {
    errors.push("Value does not match the required pattern.");
  }

  if (rules.maxLength !== undefined && value.length > rules.maxLength) {
    errors.push(`Value exceeds maximum length of ${rules.maxLength}.`);
  }

  if (rules.minLength !== undefined && value.length < rules.minLength) {
    errors.push(`Value is below minimum length of ${rules.minLength}.`);
  }

  if (rules.customValidator) {
    const customError = await rules.customValidator(value, {});
    if (typeof customError === "string") {
      errors.push(customError);
    }
  }

  if (rules.extraValidation) {
    for (const key in rules.extraValidation) {
      const extraError = await rules.extraValidation[key](value, {});
      if (typeof extraError === "string") {
        errors.push(extraError);
      }
    }
  }

  return errors.length > 0 ? errors : true;
}

// Debounced version of the validateValue function
export const debouncedValidateValue = debounce(validateValue, 300);
