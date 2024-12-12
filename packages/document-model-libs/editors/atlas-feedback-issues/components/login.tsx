import { useCallback } from "react";

export function Login() {
  const handleLogin = useCallback(() => {
    console.log("login");
  }, []);
  return (
    <div>
      <button onClick={() => handleLogin()}>Login</button>
    </div>
  );
}
