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
          className={`bg-orange-500 text-xs  hover:bg-orange-600 text-white font-semibold py-2 px-4 rounded   mx-auto`}
          onClick={() => {
            signIn();
          }}
        >
          <div className="flex flex-row items-center text-white rounded">
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
      <div className="bg-white px-5 flex flex-row gap-4 items-center my-auto">
        <div className="flex py-2 border-b-4 border-orange-600 text-orange-500">
          API Tokens
        </div>
        <div className="flex grow justify-end">
          <Link
            onClick={() => {
              signOut();
            }}
            href={"/"}
          >
            <div className="flex flex-row items-center text-orange-400 hover:bg-gray-300 rounded">
              <div className="w-20">Sign Out</div>{" "}
              <div className="w-8">
                <ArrowRightStartOnRectangleIcon className="text-orange-500" />
              </div>
            </div>
          </Link>
        </div>
      </div>
      <TokenForm />
      <div className="bg-white p-5 flex-flex-col gap-4">
        <div className="font-semibold  mb-4">Existing Tokens</div>
        <TokensTable />
      </div>
    </div>
  );
};

export default User;
