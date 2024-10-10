export interface ScalarDemoProps {
  name: string;
}

export const ScalarDemo: React.FC<ScalarDemoProps> = ({ name }) => (
  <div className="rounded-md bg-yellow-200 p-3">Scalar Demo: {name}</div>
);
