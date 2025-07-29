import { type PHPackage } from '@powerhousedao/state';
import { driveDocumentModelModule } from 'document-drive';
import { documentModelDocumentModelModule } from 'document-model';

export function loadBaseDocumentModels() {
    return [
        {
            id: 'powerhouse/document-drive',
            documentModels: [driveDocumentModelModule],
        },
        {
            id: 'powerhouse/document-model',
            documentModels: [documentModelDocumentModelModule],
        },
    ] as PHPackage[];
}
