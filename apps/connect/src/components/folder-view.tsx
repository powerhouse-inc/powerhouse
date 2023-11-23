import { ReactComponent as IconFile } from '@/assets/icons/file2.svg';
import { ReactComponent as IconFolder } from '@/assets/icons/folder.svg';
import { TreeItem } from '@powerhousedao/design-system';
import { FileNode, FolderNode } from 'document-model-libs/document-drive';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';

interface IProps {
    drive: string;
    folder?: TreeItem;
    onFolderSelected: (drive: string, id: string) => void;
    onFileSelected: (drive: string, id: string) => void;
    onFileDeleted: (drive: string, id: string) => void;
}

export const FolderView: React.FC<IProps> = ({
    drive,
    folder,
    onFolderSelected,
    onFileSelected,
    onFileDeleted,
}) => {
    const { getChildren } = useDocumentDriveServer();
    const children = getChildren(drive, folder?.id);
    const folders = children.filter(
        node => node.kind === 'folder'
    ) as FolderNode[];
    const files = children.filter(node => node.kind === 'file') as FileNode[];

    return (
        <div>
            <ul className="mb-3 flex gap-5">
                {folders.map(folder => (
                    <button
                        key={folder.id}
                        className="flex flex-col items-center rounded-md p-2 hover:bg-black/5"
                        onClick={() => onFolderSelected(drive, folder.id)}
                    >
                        <IconFolder className="mb-2" />
                        <p>{folder.name}</p>
                    </button>
                ))}
            </ul>
            <table className="w-full">
                <tbody>
                    {files?.map(file => (
                        <tr
                            key={file.id}
                            className="cursor-pointer rounded-md hover:bg-black/5"
                            onClick={() => onFileSelected(drive, file.id)}
                        >
                            <td className="flex flex-[66%] items-center">
                                <IconFile />
                                <span className="ml-1">{file.name}</span>
                            </td>
                            <td>
                                <small className="ml-3">
                                    {file.documentType}
                                </small>
                            </td>
                            <td>
                                <button
                                    className="text-red-500 hover:underline"
                                    onClick={e => {
                                        e.stopPropagation();
                                        onFileDeleted(drive, file.id);
                                    }}
                                >
                                    Delete
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default FolderView;
