import { schema } from "@powerhousedao/scalars/EmailAddress";

export interface ScalarDemoProps {
  name: string;
}

export const ScalarDemo: React.FC<ScalarDemoProps> = ({ name }) => {
  const result = schema.safeParse(name);
  console.log(result);

  return (
    <div className="bg-yellow-200 rounded-md p-3">Scalar Demo: {name}</div>
  );
};