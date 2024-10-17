import useAuth, { Session, authStore } from "@/hooks/useAuth";

export const TokensTable = () => {
    const { revokeSession } = useAuth();
    const sessions = authStore((state) => state.sessions);

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Name
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Type
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Token
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Expires At
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Allowed Origins
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                        </th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {sessions?.map((session, index) => (
                        <tr key={index}>
                            <td className="px-6 py-4 whitespace-nowrap">{session.name}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{session.isUserCreated ? "User created" : "Browser Session"}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{session.referenceTokenId}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{session.referenceExpiryDate?.toLocaleString() ?? "never"}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{session.allowedOrigins}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 inline-flex`}>{session.revokedAt ? "Revoked at " + session.revokedAt.toLocaleString() : "Active since " + session.createdAt.toLocaleString()}</span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                {session.revokedAt ? null : (
                                    <button onClick={() => revokeSession(session.id)} className="text-red-600 hover:text-red-900">
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
