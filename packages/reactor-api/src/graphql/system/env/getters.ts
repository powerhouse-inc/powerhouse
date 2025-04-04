export const getAdminUsers = (): string[] => {
  return (
    process.env.ADMIN_USERS?.split(",").map((user) =>
      user.trim().toLocaleLowerCase(),
    ) || []
  );
};
