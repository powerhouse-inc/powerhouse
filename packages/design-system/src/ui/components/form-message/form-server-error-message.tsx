import { useFormContext } from "react-hook-form";
import { FormMessageList } from "./message-list.js";

export const FormServerErrorMessage = () => {
  const { formState } = useFormContext();

  if (!formState.errors.root?.serverError.message) {
    return null;
  }

  return (
    <FormMessageList
      messages={[formState.errors.root.serverError.message]}
      type="error"
    />
  );
};
