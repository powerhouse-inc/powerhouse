/* eslint-disable react/jsx-no-bind */
import { useState, useEffect } from "react";
import { EditIcon } from "./EditIcon";
import { CloseIcon } from "./CloseIcon";

export interface EditableLabelProps {
  label: string;
  style?: React.CSSProperties;
  onSubmit?: (label: string) => void;
}

export const EditableLabel: React.FC<EditableLabelProps> = ({
  label: initialLabel,
  onSubmit,
  style,
}) => {
  const [hover, setHover] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(initialLabel);

  useEffect(() => {
    setLabel(initialLabel);
  }, [initialLabel]);

  const editIcon = (
    <div onClick={() => setIsEditing(true)} style={{ cursor: "pointer" }}>
      <EditIcon />
    </div>
  );

  const cancelIcon = (
    <div
      onClick={() => {
        setIsEditing(false);
        setLabel(initialLabel);
      }}
      style={{ cursor: "pointer" }}
    >
      <CloseIcon />
    </div>
  );

  const readContent = <h1 style={style}>{label}</h1>;

  const writeContent = (
    <input
      onChange={(e) => setLabel(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setIsEditing(false);
          setLabel(initialLabel);
        }

        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();

          setIsEditing(false);
          onSubmit?.(label);
        }
      }}
      style={style}
      type="text"
      value={label}
    />
  );

  const iconContent = isEditing ? cancelIcon : editIcon;
  const labelContent = isEditing ? writeContent : readContent;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}
    >
      {labelContent}
      {hover || isEditing ? iconContent : null}
    </div>
  );
};
