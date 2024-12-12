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
    <header className="bg-orange-100 fixed w-full top-0 text-black h-14">
      <nav className="flex justify-between items-center flex-row h-14">
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
        <div className="flex  justify-center gap-4">
          {address !== "" ? (
            <select
              id="graphqlPlayground"
              name="graphqlPlayground"
              aria-placeholder="Select GraphQL Playground"
              className="p-2 border border-gray-300 rounded-md w-full"
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
          <div className="flex items-center  text-orange-300">
            <SwitchboardLink
              className="bg-orange-200 rounded-2xl px-4 text-orange-400 flex flex-row items-center gap-2 py-2"
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
          <div className="text-orange-300 pr-2 my-auto">
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
