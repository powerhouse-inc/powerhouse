import React from "react";
import { FormMessage, FormMessageType } from "./form-message";
import { cn } from "@/scalars/lib";

interface FormMessageListProps {
  messages: string[];
  type?: FormMessageType;
  className?: string;
}

export const FormMessageList: React.FC<FormMessageListProps> = ({
  messages,
  type = "info",
  className,
}) => {
  if (messages.length === 0) {
    return null;
  }

  if (messages.length === 1) {
    return <FormMessage type={type}>{messages[0]}</FormMessage>;
  }

  const typeClasses: Record<FormMessageType, string> = {
    error: "before:bg-red-900 dark:before:bg-red-700",
    info: "before:bg-blue-900 dark:before:bg-blue-900",
    warning: "before:bg-orange-900 dark:before:bg-orange-900",
  };

  return (
    <ul className={cn("flex flex-col gap-1", className)}>
      {messages.map((message) => (
        <FormMessage
          key={message}
          as="li"
          type={type}
          className={cn(
            // Layout
            "relative pl-4",
            // Visual styles
            "before:absolute before:left-0 before:top-[0.4em] before:size-2 before:rounded-full",
            typeClasses[type],
          )}
        >
          {message}
        </FormMessage>
      ))}
    </ul>
  );
};