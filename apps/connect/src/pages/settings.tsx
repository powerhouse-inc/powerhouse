import { NavLink } from "react-router-dom";

const Settings = () => {
  return (
    <div className="px-8 py-4">
      <div className="mb-8 flex items-center justify-between">
        <h4 className="text-3xl font-bold leading-normal">Settings</h4>
        <NavLink to="/">
          <svg
            className="rotate-45"
            width="24"
            height="24"
            viewBox="0 0 15 15"
            xmlns="http://www.w3.org/2000/svg"
            fill="currentcolor"
          >
            <path d="M7.5 0.5C7.98325 0.5 8.375 0.891751 8.375 1.375V6.625L13.625 6.625C14.1082 6.625 14.5 7.01675 14.5 7.5C14.5 7.98325 14.1082 8.375 13.625 8.375H8.375V13.625C8.375 14.1082 7.98325 14.5 7.5 14.5C7.01675 14.5 6.625 14.1082 6.625 13.625L6.625 8.375H1.375C0.891751 8.375 0.5 7.98325 0.5 7.5C0.5 7.01675 0.891751 6.625 1.375 6.625H6.625V1.375C6.625 0.891751 7.01675 0.5 7.5 0.5Z" />
          </svg>
        </NavLink>
      </div>
      <div className="mb-8">
        <h5 className="text-2xl leading-relaxed">General</h5>
      </div>
      <div className="mb-8">
        <h5 className="mb-8 text-2xl leading-relaxed">Budget Statements</h5>
        <div className="rounded-2xl bg-slate-50 py-24 text-center">
          <h5 className="text-2xl leading-relaxed">
            Google Sheet Intergration
          </h5>
        </div>
      </div>
      <div className="mb-8">
        <h5 className="text-2xl leading-relaxed">Document Models</h5>
      </div>

      <div className="mb-8">
        <h5 className="text-2xl leading-relaxed">LDF Applications</h5>
      </div>
    </div>
  );
};

export const element = <Settings />;
export default Settings;
