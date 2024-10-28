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

  return (
    <ul className={cn("flex flex-col gap-1", className)}>
      {messages.map((message) => (
        <FormMessage key={message} as={"li"} type={type}>
          {message}
        </FormMessage>
      ))}
    </ul>
  );
};
