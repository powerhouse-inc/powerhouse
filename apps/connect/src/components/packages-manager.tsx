import { useState } from 'react';
import { useExternalPackages } from 'src/store/external-packages';
import { getHMRModule } from 'src/utils/hmr';

export async function loadExternalPackage(name: string) {
    const hmr = await getHMRModule();
    if (hmr) {
        hmr.send('studio:add-external-package', {
            name,
        });
    } else {
        console.error('HMR not available.');
    }
}

async function handlePackageEvents() {
    const hmr = await getHMRModule();
    if (!hmr) {
        return;
    }
    hmr.on('studio:external-package-added', (data: any) => {
        console.log('External package added:', data);
    });
}
handlePackageEvents().catch(console.error);

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
            <button onClick={() => loadExternalPackage(name)}>Add</button>
            <ul>
                {packages.map((pkg, index) => (
                    <li key={index}>
                        {pkg.documentModels
                            .map(dm => dm.documentModel.id)
                            .join(', ')}
                    </li>
                ))}
            </ul>
        </div>
    );
}
