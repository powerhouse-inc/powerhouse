import { ReactComponent as IconCross } from '@/assets/icons/cross.svg';
import { NavLink } from 'react-router-dom';

const Settings = () => {
    return (
        <div className="px-8 py-4">
            <div className="mb-8 flex items-center justify-between">
                <h4 className="text-3xl font-bold leading-normal">Settings</h4>
                <NavLink to="/">
                    <IconCross
                        width={24}
                        height={24}
                        className="rotate-45 fill-current"
                    />
                </NavLink>
            </div>
            <div className="mb-8">
                <h5 className="text-2xl leading-relaxed">General</h5>
            </div>
            <div className="mb-8">
                <h5 className="mb-8 text-2xl leading-relaxed">
                    Budget Statements
                </h5>
                <div className="bg-light rounded-[20px] py-24 text-center">
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
