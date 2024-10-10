'use client';
import useAuth from '@/hooks/useAuth';
import { FormEvent, useState } from 'react';

const DriveForm = () => {
    const [formData, setFormData] = useState({
        name: '',
        slug: '',
        allowedOrigin: '',
    });

    const [submitDisabled, setSubmitDisabled] = useState(false);

    const [showModal, setShowModal] = useState(false);
    const [token, setToken] = useState('');

    const [drive, setDrive] = useState(null);

    const { createSession } = useAuth();

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    ) => {
        const { name, value } = e.target;
        setFormData({
            ...formData,
            [name]: value,
        });
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        // set state submitting to true
        // Handle form submission logic here

        // send the form data as graphql request to create a new drive
        // show modal with new created drive
        // clear form data
        // set state submitting to false
    };

    return (
        <div className="bg-white p-5">
            <span className="mb-4 mt-8 font-semibold">Create new Drive</span>
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
                        htmlFor="slug"
                        className="block text-sm font-semibold text-black"
                    >
                        Slug
                    </label>
                    <input
                        type="text"
                        id="slug"
                        name="slug"
                        value={formData.slug}
                        onChange={handleChange}
                        className="mt-1 w-full rounded-md border border-gray-300 p-2"
                    />
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
                                    <h3 className="text-3xl font-semibold">
                                        API Token
                                    </h3>
                                    <button
                                        className="float-right ml-auto border-0 bg-transparent p-1 text-3xl font-semibold leading-none text-black opacity-5 outline-none focus:outline-none"
                                        onClick={() => setShowModal(false)}
                                    >
                                        <span className="block size-6 bg-transparent text-2xl text-black opacity-5 outline-none focus:outline-none">
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

export default DriveForm;
