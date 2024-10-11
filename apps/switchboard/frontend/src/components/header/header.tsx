"use client";
import useAuth, { authStore } from "@/hooks/useAuth";
import { UserCircleIcon } from "@heroicons/react/24/solid";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import github from "../../../public/assets/github.svg";
import logo from "../../../public/assets/logo.svg";
import SwitchboardLink from "../text/Link";
export default function Header() {
  const address = authStore((state) => state.address);
  const gqlToken = authStore((state) => state.gqlToken);
  const { checkAuthValidity, getDrives } = useAuth();
  const router = useRouter();

  const [drives, setDrives] = useState<string[]>([]);

  useEffect(() => {
    if (!gqlToken) {
      return;
    }

    const updateDrives = async () => {
      await checkAuthValidity();
      const drives = await getDrives();
      setDrives(drives);
    };

    updateDrives().catch(console.error);
  }, [gqlToken]);

  const selectGraphQLPlayground = (e: React.ChangeEvent<HTMLSelectElement>) => {
    e.preventDefault();
    const drive = e.target.value;
    if (drive === "system") {
      router.push(`/graphql`);
    } else if (drive !== "") {
      router.push(`/graphql/${drive}`);
    }
  };
  return (
    <header className="fixed top-0 h-14 w-full bg-orange-100 text-black">
      <nav className="flex h-14 flex-row items-center justify-between">
        <div className="flex items-start">
          <SwitchboardLink href="/">
            <div className="flex flex-row items-center">
              <Image
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
          <div className="flex items-center  text-orange-300">
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
              <Image src={github} alt="GitHub" width="32" height="32" />
            </Link>
          </div>
        </div>
      </nav>
    </header>
  );
}
