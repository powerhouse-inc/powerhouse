// ph-stub: upstream installs custom piece packages on the AP server; not
// supported when the catalog is proxied through the workflow runtime.
type InstallPieceDialogProps = {
  onInstallPiece: (pieceName: string, pieceVersion: string) => void;
  scope: unknown;
};

const InstallPieceDialog = (_props: InstallPieceDialogProps) => null;

export { InstallPieceDialog };
