import SwitchboardLink from "../text/Link";
import useAuth, { authStore } from "../../hooks/useAuth";
import { UserCircleIcon } from "@heroicons/react/24/solid";
import Link from "../text/Link";
import { useEffect, useState } from "react";
import logo from "../../assets/logo.svg";
import github from "../../assets/github.svg";
import { route } from "preact-router";

export default function Header() {
  const address = authStore((state) => state.address);
  const gqlToken = authStore((state) => state.gqlToken);
  const auth = useAuth();

  const [drives, setDrives] = useState([]);

  useEffect(() => {
    auth.checkAuthValidity();
    auth
      .getDrives()
      .then((drives) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        setDrives(drives);
      })
      .catch(console.error);
  }, [gqlToken, address]);

  const selectGraphQLPlayground = (e: React.ChangeEvent<HTMLSelectElement>) => {
    e.preventDefault();
    if (!e.target) {
      return;
    }
    const { value: drive } = e.target as HTMLInputElement;
    if (drive === "system") {
      route(`/graphql`);
    } else if (drive !== "") {
      route(`/graphql/${drive}`);
    }
  };
  return (
    <header className="fixed top-0 h-14 w-full bg-orange-100 text-black">
      <nav className="flex h-14 flex-row items-center justify-between">
        <div className="flex items-start">
          <SwitchboardLink href="/">
            <div className="flex flex-row items-center">
              <img
                src={logo}
                alt="Switchboard Logo"
                className="w-10"
                width="32"
                height="32"
              />
              Switchboard API
            </div>
          </SwitchboardLink>
        </div>
        <div className="flex justify-center gap-4">
          {address !== "" ? (
            <select
              id="graphqlPlayground"
              name="graphqlPlayground"
              aria-placeholder="Select GraphQL Playground"
              className="w-full rounded-md border border-gray-300 p-2"
              onChange={selectGraphQLPlayground}
            >
              <option value="">GraphQL Playgrounds</option>
              <option value="system">System</option>
              {drives.map((drive, i) => (
                <option value={drive} key={i}>
                  {drive}
                </option>
              ))}
            </select>
          ) : (
            ""
          )}
        </div>
        <div className="flex flex-row gap-2">
          <div className="flex items-center text-orange-300">
            <SwitchboardLink
              className="flex flex-row items-center gap-2 rounded-2xl bg-orange-200 px-4 py-2 text-orange-400"
              href="/user"
            >
              <span>
                {address !== ""
                  ? address.slice(0, 4) + "..." + address.slice(-4)
                  : "Login"}
              </span>
              <span className="h-5">
                <UserCircleIcon className="h-5" />
              </span>
            </SwitchboardLink>
          </div>
          <div className="my-auto pr-2 text-orange-300">
            <Link
              href="https://github.com/powerhouse-inc/switchboard-boilerplate"
              target="_blank"
            >
              <img src={github} alt="GitHub" width="32" height="32" />
            </Link>
          </div>
        </div>
      </nav>
    </header>
  );
}
