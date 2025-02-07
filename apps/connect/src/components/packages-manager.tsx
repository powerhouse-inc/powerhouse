import { useState } from 'react';
import { loadExternalPackage, removeExternalPackage } from 'src/services/hmr';
import { useExternalPackages } from 'src/store/external-packages';

export default function PackagesManager() {
    const [name, setName] = useState('');

    const packages = useExternalPackages();
    return (
        <div>
            <label
                htmlFor="add-external-package"
                className="bg-gray-50 text-sm"
            >
                Add External Package:
                <input
                    className="border border-slate-50"
                    name="add-external-package"
                    value={name}
                    onChange={e => setName(e.target.value)}
                />
            </label>
            <button type="submit" onClick={() => loadExternalPackage(name)}>
                Add
            </button>
            <ul>
                {packages.map((pkg, index) => (
                    <li key={index}>
                        {pkg.documentModels
                            .map(dm => dm.documentModel.id)
                            .join(', ')}
                        <button
                            type="button"
                            onClick={() =>
                                removeExternalPackage('@sky-ph/atlas')
                            }
                        >
                            Delete
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
