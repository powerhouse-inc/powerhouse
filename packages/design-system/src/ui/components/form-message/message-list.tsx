import { twMerge } from "tailwind-merge";
import type { FormMessageType } from "./form-message.js";
import { FormMessage } from "./form-message.js";

interface FormMessageListProps {
  messages: string[];
  type?: FormMessageType;
  className?: string;
}

export const FormMessageList: React.FC<FormMessageListProps> = ({
  messages,
  type = "info",
  className,
  ...props
}) => {
  if (messages.length === 0) {
    return null;
  }

  if (messages.length === 1) {
    return (
      <FormMessage type={type} {...props}>
        {messages[0]}
      </FormMessage>
    );
  }

  const typeClasses: Record<FormMessageType, string> = {
    error: "before:bg-destructive",
    info: "before:bg-info",
    warning: "before:bg-warning",
  };

  return (
    <ul className={twMerge("flex flex-col gap-1", className)} {...props}>
      {messages.map((message) => (
        <FormMessage
          key={message}
          as="li"
          type={type}
          className={twMerge(
            // Layout
            "relative pl-4",
            // Visual styles
            "before:absolute before:top-[0.4em] before:left-0 before:size-2 before:rounded-full",
            typeClasses[type],
          )}
        >
          {message}
        </FormMessage>
      ))}
    </ul>
  );
};
