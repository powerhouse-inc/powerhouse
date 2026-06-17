import type { FormEvent } from "preact/compat";
import { useState } from "preact/hooks";
import { twMerge } from "tailwind-merge";
import useAuth from "../../hooks/useAuth.js";

const TokenForm = () => {
  const [formData, setFormData] = useState({
    name: "",
    duration: "",
    allowedOrigin: "",
  });

  const [showModal, setShowModal] = useState(false);
  const [token, setToken] = useState("");

  const { createSession } = useAuth();

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    if (!e.target) {
      return;
    }
    const { name, value } = e.target as HTMLInputElement;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Handle form submission logic here
    setToken(
      await createSession(
        formData.name !== "" ? formData.name : "Default Token",
        parseInt(formData.duration !== "" ? formData.duration : "60"),
        formData.allowedOrigin !== "" ? formData.allowedOrigin : "*",
      ),
    );
    setShowModal(true);
  };

  const submitDisabled = formData.name === "";

  return (
    <div className="bg-background p-5">
      <span className="mt-8 mb-4 font-semibold">Create new token</span>
      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        className="mx-auto mt-4 flex w-full flex-row items-end gap-4"
      >
        <div className="flex-1 flex-col">
          <label
            htmlFor="name"
            className="block text-sm font-semibold text-foreground"
          >
            Name
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-border p-2"
          />
        </div>
        <div className="flex-1 flex-col">
          <label
            htmlFor="duration"
            className="block text-sm font-semibold text-foreground"
          >
            Duration
          </label>
          <select
            id="duration"
            name="duration"
            aria-placeholder="Select Duration"
            value={formData.duration}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-border p-2"
          >
            <option value="3600">1 Hour</option>
            <option value="86400">1 Day</option>
            <option value="604800">1 Week</option>
            <option value="2629800">1 Month</option>
            <option value="31557600">1 Year</option>
            <option value="0">Non Expiring</option>
          </select>
        </div>
        <div className="flex-1 flex-col">
          <label
            htmlFor="allowedOrigin"
            className="block text-sm font-semibold text-foreground"
          >
            Allowed Origin
          </label>
          <input
            type="text"
            id="allowedOrigin"
            name="allowedOrigin"
            placeholder="*"
            value={formData.allowedOrigin}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-border p-2"
          />
        </div>
        <div className="flex h-full flex-col items-end">
          <button
            disabled={submitDisabled}
            type="submit"
            className={twMerge(
              "rounded-sm bg-warning px-4 py-2 font-semibold text-warning-foreground",
              !submitDisabled && "hover:hover-effect",
            )}
          >
            Create New Token
          </button>
        </div>
      </form>
      {showModal ? (
        <>
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-x-hidden overflow-y-auto outline-hidden focus:outline-hidden">
            <div className="relative mx-auto my-6 w-auto max-w-3xl">
              {/*content*/}
              <div className="relative flex w-full flex-col rounded-lg border-0 bg-background shadow-lg outline-hidden focus:outline-hidden">
                {/*header*/}
                <div className="flex items-start justify-between rounded-t border-b border-solid border-border p-5">
                  <h3 className="text-3xl font-semibold">API Token</h3>
                  <button
                    className="float-right ml-auto border-0 bg-transparent p-1 text-3xl leading-none font-semibold text-foreground opacity-5 outline-hidden focus:outline-hidden"
                    onClick={() => setShowModal(false)}
                  >
                    <span className="block size-6 bg-transparent text-2xl text-foreground opacity-5 outline-hidden focus:outline-hidden">
                      ×
                    </span>
                  </button>
                </div>
                {/*body*/}
                <div className="relative flex-auto p-6">
                  <div className="my-4 text-lg/relaxed wrap-break-word text-muted-foreground">
                    {token}
                  </div>
                </div>
                {/*footer*/}
                <div className="flex items-center justify-end rounded-b border-t border-solid border-border p-6">
                  <button
                    className="mr-1 mb-1 bg-transparent px-6 py-2 text-sm font-bold text-destructive uppercase outline-hidden transition-all duration-150 ease-linear focus:outline-hidden"
                    type="button"
                    onClick={() => setShowModal(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="fixed inset-0 z-40 bg-primary opacity-25"></div>
        </>
      ) : null}
    </div>
  );
};

export default TokenForm;
