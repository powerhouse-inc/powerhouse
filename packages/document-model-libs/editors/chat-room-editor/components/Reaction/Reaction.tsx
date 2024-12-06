/* eslint-disable react/jsx-no-bind */
import React from "react";

export type ReactionType = {
  type: string;
  emoji: string;
  reactedBy: string[];
};

export interface ReactionProps {
  readonly reaction: ReactionType;
  readonly onClick?: () => void;
  readonly bgColor: string;
  readonly textColor: string;
  readonly disabled?: boolean;
}

export const Reaction: React.FC<ReactionProps> = (props) => {
  const { bgColor, reaction, textColor, onClick, disabled = false } = props;

  const onClickHandler = () => {
    if (!disabled && onClick) {
      onClick();
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        userSelect: "none",
      }}
    >
      <div
        onClick={onClickHandler}
        style={{
          width: "20px",
          height: "20px",
          fontSize: "12px",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: bgColor,
          borderRadius: "50%",
          marginRight: "4px",
          textAlign: "center",
          cursor: disabled ? "default" : "pointer",
        }}
      >
        {reaction.emoji}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          fontSize: "12px",
          color: textColor,
          fontWeight: "bold",
        }}
      >
        {reaction.reactedBy.length}
      </div>
    </div>
  );
};
