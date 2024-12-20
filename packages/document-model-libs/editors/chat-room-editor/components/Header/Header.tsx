import { EditableLabel } from "./EditableLabel";
export interface HeaderProps {
  title: string;
  description?: string;
  onTitleSubmit?: (title: string) => void;
  onDescriptionSubmit?: (description: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  description,
  onTitleSubmit,
  onDescriptionSubmit,
}) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
      }}
    >
      <EditableLabel
        label={title}
        onSubmit={onTitleSubmit}
        style={{
          fontSize: "18px",
          fontWeight: "bold",
          margin: 0,
        }}
      />
      {description ? (
        <EditableLabel
          label={description}
          onSubmit={onDescriptionSubmit}
          style={{
            minWidth: "200px",
            fontSize: "14px",
            color: "#666",
            margin: 0,
          }}
        />
      ) : null}
    </div>
  );
};
