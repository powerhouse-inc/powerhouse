/* eslint-disable react/jsx-no-bind */
import { useState } from "react";
import { SendIcon } from "./SendIcon";

export interface TextInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
}

export const TextInput: React.FC<TextInputProps> = ({
  onSendMessage,
  disabled = false,
}) => {
  const [message, setMessage] = useState("");

  const onSubmit = () => {
    onSendMessage(message);
    setMessage("");
  };

  return (
    <div
      style={{
        backgroundColor: "#eeeef8",
        borderRadius: "8px",
        display: "flex",
        padding: "8px",
        paddingLeft: "16px",
        paddingRight: "16px",
        fontSize: "14px",
        gap: "8px",
      }}
    >
      <input
        disabled={disabled}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.stopPropagation();
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder="Type a message..."
        style={{
          backgroundColor: "transparent",
          display: "flex",
          flex: 1,
          outline: "none",
        }}
        type="text"
        value={message}
      />
      <button
        disabled={disabled}
        onClick={onSubmit}
        style={{ color: "#434385", padding: "4px" }}
        type="button"
      >
        <SendIcon />
      </button>
    </div>
  );
};
