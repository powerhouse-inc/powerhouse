import TokenForm from "../components/tokens/token-form";
import TokensTable from "../components/tokens/tokens-table";
import useAuth, { authStore } from "../hooks/useAuth";
import { ArrowRightStartOnRectangleIcon } from "@heroicons/react/24/solid";
import Link from "../components/text/Link";

const User = () => {
  const address = authStore((state) => state.address);

  const { signIn, signOut } = useAuth();

  if (!address) {
    return (
      <div className="flex flex-col gap-8 pt-14">
        <button
          type="submit"
          className={`mx-auto rounded-sm bg-orange-500 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-600`}
          onClick={() => {
            signIn();
          }}
        >
          <div className="flex flex-row items-center rounded-sm text-white">
            <div className="w-8">
              <ArrowRightStartOnRectangleIcon className="" />
            </div>{" "}
            <div className="w-32 grow">Sign in with Ethereum</div>
          </div>
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-8 pt-14">
      <div className="my-auto flex flex-row items-center gap-4 bg-white px-5">
        <div className="flex border-b-4 border-orange-600 py-2 text-orange-500">
          API Tokens
        </div>
        <div className="flex grow justify-end">
          <Link
            onClick={() => {
              signOut();
            }}
            href={"/"}
          >
            <div className="flex flex-row items-center rounded-sm text-orange-400 hover:bg-gray-300">
              <div className="w-20">Sign Out</div>{" "}
              <div className="w-8">
                <ArrowRightStartOnRectangleIcon className="text-orange-500" />
              </div>
            </div>
          </Link>
        </div>
      </div>
      <TokenForm />
      <div className="flex-flex-col gap-4 bg-white p-5">
        <div className="mb-4 font-semibold">Existing Tokens</div>
        <TokensTable />
      </div>
    </div>
  );
};

export default User;
