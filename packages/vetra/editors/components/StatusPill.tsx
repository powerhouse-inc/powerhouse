export interface StatusPillProps {
  status: 'draft' | 'confirmed';
  label: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({
  status,
  label
}) => {
  return (
    <div className={`px-3 py-1 rounded-full text-xs font-medium ${
      status === 'confirmed'
        ? "bg-green-100 text-green-800" 
        : "bg-yellow-100 text-yellow-800"
    }`}>
      {label}
    </div>
  );
};