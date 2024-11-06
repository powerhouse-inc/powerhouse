type Props = {
  errors: string;
};

export function Errors({ errors }: Props) {
  return (
    <div>
      {errors.split("\n").map((error) => (
        <p className="text-red-900" key={error}>
          {error}
        </p>
      ))}
    </div>
  );
}
