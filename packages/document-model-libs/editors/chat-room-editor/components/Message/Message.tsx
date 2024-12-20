import { ReactionType, Reaction } from "../Reaction";

export interface MessageReaction extends Omit<ReactionType, "quantity"> {
  messageId: string;
}

export interface MessageProps {
  id: string;
  message: string;
  userName: string;
  timestamp: string;
  reactions?: ReactionType[];
  isCurrentUser?: boolean;
  disabled?: boolean;
  onClickReaction?: (reaction: MessageReaction) => void;
}

export const Message: React.FC<MessageProps> = (props) => {
  const {
    message,
    userName,
    timestamp,
    reactions,
    isCurrentUser,
    onClickReaction,
    disabled = false,
  } = props;

  const date = new Date(timestamp).toLocaleTimeString();
  const bgColor = isCurrentUser ? "#7678ed" : "#eeeef8";
  const reactionBgColor = isCurrentUser ? "#eeeef8" : "#cfcff6";
  const textColor = isCurrentUser ? "white" : "black";

  return (
    <div
      style={{
        display: "flex",
      }}
    >
      {!isCurrentUser && (
        <div
          style={{
            width: "12px",
            height: "20px",
            backgroundColor: "#eeeef8",
            alignSelf: "flex-end",
          }}
        >
          <div
            style={{
              width: "12px",
              height: "20px",
              backgroundColor: "white",
              borderBottomRightRadius: "40px",
            }}
          />
        </div>
      )}
      <div
        style={{
          backgroundColor: bgColor,
          color: isCurrentUser ? "white" : "black",
          display: "flex",
          flexDirection: "column",
          padding: "8px",
          fontSize: "14px",
          borderRadius: "8px",
          maxWidth: "600px",
          borderBottomRightRadius: isCurrentUser ? "0px" : "8px",
          borderBottomLeftRadius: isCurrentUser ? "8px" : "0px",
        }}
      >
        {!isCurrentUser && (
          <div
            style={{
              color: "#36377c",
              fontSize: "12px",
              marginBottom: "4px",
              fontWeight: "bold",
            }}
          >
            {userName}:
          </div>
        )}
        <div>{message}</div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "10px",
            marginTop: "8px",
            alignItems: "flex-end",
            gap: "30px",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "10px",
            }}
          >
            {(reactions || []).map((reaction) => (
              <Reaction
                bgColor={reactionBgColor}
                disabled={disabled}
                key={reaction.type}
                onClick={() =>
                  onClickReaction &&
                  onClickReaction({
                    messageId: props.id,
                    ...reaction,
                  })
                }
                reaction={reaction}
                textColor={textColor}
              />
            ))}
          </div>
          <div>{date}</div>
        </div>
      </div>
      {isCurrentUser ? (
        <div
          style={{
            width: "12px",
            height: "20px",
            backgroundColor: "#7678ed",
            alignSelf: "flex-end",
          }}
        >
          <div
            style={{
              width: "12px",
              height: "20px",
              backgroundColor: "white",
              borderBottomLeftRadius: "40px",
            }}
          />
        </div>
      ) : null}
    </div>
  );
};
