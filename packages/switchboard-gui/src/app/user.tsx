import { ArrowRightStartOnRectangleIcon } from "@heroicons/react/24/solid";
import Link from "../components/text/Link.js";
import TokenForm from "../components/tokens/token-form.js";
import TokensTable from "../components/tokens/tokens-table.js";
import useAuth, { authStore } from "../hooks/useAuth.js";

const User = () => {
  const address = authStore((state) => state.address);

  const { signIn, signOut } = useAuth();

  if (!address) {
    return (
      <div className="flex flex-col gap-8 pt-14">
        <button
          type="submit"
          className={`mx-auto rounded-sm bg-warning px-4 py-2 text-xs font-semibold text-warning-foreground hover:hover-effect`}
          onClick={() => {
            void signIn();
          }}
        >
          <div className="flex flex-row items-center rounded-sm text-foreground">
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
      <div className="my-auto flex flex-row items-center gap-4 bg-background px-5">
        <div className="flex border-b-4 border-warning py-2 text-warning">
          API Tokens
        </div>
        <div className="flex grow justify-end">
          <Link
            onClick={() => {
              void signOut();
            }}
            href={"/"}
          >
            <div className="flex flex-row items-center rounded-sm text-warning hover:hover-effect">
              <div className="w-20">Sign Out</div>{" "}
              <div className="w-8">
                <ArrowRightStartOnRectangleIcon className="text-warning" />
              </div>
            </div>
          </Link>
        </div>
      </div>
      <TokenForm />
      <div className="flex flex-col gap-4 bg-background p-5">
        <div className="mb-4 font-semibold">Existing Tokens</div>
        <TokensTable />
      </div>
    </div>
  );
};

export default User;
