import useAuth, { authStore } from "../../hooks/useAuth.js";

export const TokensTable = () => {
  const { revokeSession } = useAuth();
  const sessions = authStore((state) => state.sessions);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50 dark:bg-slate-800">
          <tr>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-100"
            >
              Name
            </th>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-100"
            >
              Type
            </th>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-100"
            >
              Token
            </th>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-100"
            >
              Expires At
            </th>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-100"
            >
              Allowed Origins
            </th>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-100"
            >
              Status
            </th>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-100"
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white dark:bg-slate-900">
          {sessions?.map((session, index) => (
            <tr key={index}>
              <td className="whitespace-nowrap px-6 py-4">{session.name}</td>
              <td className="whitespace-nowrap px-6 py-4">
                {session.isUserCreated ? "User created" : "Browser Session"}
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                {session.referenceTokenId}
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                {session.referenceExpiryDate?.toLocaleString() ?? "never"}
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                {session.allowedOrigins}
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                <span className={`inline-flex px-2`}>
                  {session.revokedAt
                    ? "Revoked at " + session.revokedAt.toLocaleString()
                    : "Active since " + session.createdAt.toLocaleString()}
                </span>
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                {session.revokedAt ? null : (
                  <button
                    onClick={() => revokeSession(session.id)}
                    className="text-red-600 hover:text-red-900 dark:text-red-400"
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
