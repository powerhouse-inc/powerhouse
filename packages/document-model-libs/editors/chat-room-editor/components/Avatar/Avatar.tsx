import { getEmojiFromString } from "../../utils";

export interface AvatarProps {
  imgUrl?: string;
  userName: string;
}

export const Avatar: React.FC<AvatarProps> = (props) => {
  const { imgUrl, userName } = props;

  return (
    <div
      style={{
        width: "40px",
        height: "40px",
        borderRadius: "10px",
        overflow: "hidden",
        backgroundColor: "#f0f0f0",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {imgUrl ? (
        <img alt="avatar" src={imgUrl} />
      ) : (
        <span
          style={{
            fontSize: "24px",
          }}
        >
          {getEmojiFromString(userName)}
        </span>
      )}
    </div>
  );
};
