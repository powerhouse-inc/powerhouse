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
      <span className="font-semibold mt-8 mb-4">Create new token</span>
      <form
        onSubmit={handleSubmit}
        className="w-full mx-auto flex flex-row gap-4 items-end mt-4"
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
            className="mt-1 p-2 border border-gray-300 rounded-md w-full"
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
            className="mt-1 p-2 border border-gray-300 rounded-md w-full"
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
            className="mt-1 p-2 border border-gray-300 rounded-md w-full"
          />
        </div>
        <div className="h-full flex flex-col items-end">
          <button
            disabled={submitDisabled}
            type="submit"
            className={`bg-orange-400 ${
              submitDisabled ? `` : `hover:bg-orange-600`
            } text-white font-semibold py-2 px-4 rounded`}
          >
            Create New Token
          </button>
        </div>
      </form>
      {showModal ? (
        <>
          <div className="justify-center items-center flex overflow-x-hidden overflow-y-auto fixed inset-0 z-50 outline-none focus:outline-none">
            <div className="relative w-auto my-6 mx-auto max-w-3xl">
              {/*content*/}
              <div className="border-0 rounded-lg shadow-lg relative flex flex-col w-full bg-white outline-none focus:outline-none">
                {/*header*/}
                <div className="flex items-start justify-between p-5 border-b border-solid border-blueGray-200 rounded-t">
                  <h3 className="text-3xl font-semibold">API Token</h3>
                  <button
                    className="p-1 ml-auto bg-transparent border-0 text-black opacity-5 float-right text-3xl leading-none font-semibold outline-none focus:outline-none"
                    onClick={() => setShowModal(false)}
                  >
                    <span className="bg-transparent text-black opacity-5 h-6 w-6 text-2xl block outline-none focus:outline-none">
                      ×
                    </span>
                  </button>
                </div>
                {/*body*/}
                <div className="relative p-6 flex-auto">
                  <div className="my-4 text-blueGray-500 text-lg leading-relaxed break-words">
                    {token}
                  </div>
                </div>
                {/*footer*/}
                <div className="flex items-center justify-end p-6 border-t border-solid border-blueGray-200 rounded-b">
                  <button
                    className="text-red-500 background-transparent font-bold uppercase px-6 py-2 text-sm outline-none focus:outline-none mr-1 mb-1 ease-linear transition-all duration-150"
                    type="button"
                    onClick={() => setShowModal(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="opacity-25 fixed inset-0 z-40 bg-black"></div>
        </>
      ) : null}
    </div>
  );
};

export default TokenForm;
