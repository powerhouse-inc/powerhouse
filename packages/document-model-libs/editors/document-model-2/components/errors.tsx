type Props = {
  errors: string;
};

export function Errors({ errors }: Props) {
  return (
    <div className="mt-1">
      {Array.from(new Set(errors.split("\n"))).map((error) => (
        <p className="text-sm font-semibold text-red-900" key={error}>
          {error}
        </p>
      ))}
    </div>
  );
}
