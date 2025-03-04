import { FormEvent, useState } from "react";
import useAuth from "../../hooks/useAuth";

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
    <div className="bg-white p-5">
      <span className="mb-4 mt-8 font-semibold">Create new token</span>
      <form
        onSubmit={handleSubmit}
        className="mx-auto mt-4 flex w-full flex-row items-end gap-4"
      >
        <div className="flex-1 flex-col">
          <label
            htmlFor="name"
            className="block text-sm font-semibold text-black"
          >
            Name
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-gray-300 p-2"
          />
        </div>
        <div className="flex-1 flex-col">
          <label
            htmlFor="duration"
            className="block text-sm font-semibold text-black"
          >
            Duration
          </label>
          <select
            id="duration"
            name="duration"
            aria-placeholder="Select Duration"
            value={formData.duration}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-gray-300 p-2"
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
            className="block text-sm font-semibold text-black"
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
            className="mt-1 w-full rounded-md border border-gray-300 p-2"
          />
        </div>
        <div className="flex h-full flex-col items-end">
          <button
            disabled={submitDisabled}
            type="submit"
            className={`bg-orange-400 ${
              submitDisabled ? `` : `hover:bg-orange-600`
            } rounded px-4 py-2 font-semibold text-white`}
          >
            Create New Token
          </button>
        </div>
      </form>
      {showModal ? (
        <>
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden outline-none focus:outline-none">
            <div className="relative mx-auto my-6 w-auto max-w-3xl">
              {/*content*/}
              <div className="relative flex w-full flex-col rounded-lg border-0 bg-white shadow-lg outline-none focus:outline-none">
                {/*header*/}
                <div className="border-blueGray-200 flex items-start justify-between rounded-t border-b border-solid p-5">
                  <h3 className="text-3xl font-semibold">API Token</h3>
                  <button
                    className="float-right ml-auto border-0 bg-transparent p-1 text-3xl font-semibold leading-none text-black opacity-5 outline-none focus:outline-none"
                    onClick={() => setShowModal(false)}
                  >
                    <span className="block h-6 w-6 bg-transparent text-2xl text-black opacity-5 outline-none focus:outline-none">
                      ×
                    </span>
                  </button>
                </div>
                {/*body*/}
                <div className="relative flex-auto p-6">
                  <div className="text-blueGray-500 my-4 break-words text-lg leading-relaxed">
                    {token}
                  </div>
                </div>
                {/*footer*/}
                <div className="border-blueGray-200 flex items-center justify-end rounded-b border-t border-solid p-6">
                  <button
                    className="background-transparent mb-1 mr-1 px-6 py-2 text-sm font-bold uppercase text-red-500 outline-none transition-all duration-150 ease-linear focus:outline-none"
                    type="button"
                    onClick={() => setShowModal(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="fixed inset-0 z-40 bg-black opacity-25"></div>
        </>
      ) : null}
    </div>
  );
};

export default TokenForm;
