import useAuth, { authStore } from "../../hooks/useAuth.js";

export const TokensTable = () => {
  const { revokeSession } = useAuth();
  const sessions = authStore((state) => state.sessions);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-border">
        <thead className="bg-background">
          <tr>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase"
            >
              Name
            </th>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase"
            >
              Type
            </th>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase"
            >
              Token
            </th>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase"
            >
              Expires At
            </th>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase"
            >
              Allowed Origins
            </th>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase"
            >
              Status
            </th>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase"
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-background">
          {sessions?.map((session, index) => (
            <tr key={index}>
              <td className="px-6 py-4 whitespace-nowrap">{session.name}</td>
              <td className="px-6 py-4 whitespace-nowrap">
                {session.isUserCreated ? "User created" : "Browser Session"}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {session.referenceTokenId}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {session.referenceExpiryDate?.toLocaleString() ?? "never"}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {session.allowedOrigins}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`inline-flex px-2`}>
                  {session.revokedAt
                    ? "Revoked at " + session.revokedAt.toLocaleString()
                    : "Active since " + session.createdAt.toLocaleString()}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {session.revokedAt ? null : (
                  <button
                    onClick={() => {
                      void revokeSession(session.id);
                    }}
                    className="text-destructive hover:hover-effect"
                  >
                    Revoke
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TokensTable;
