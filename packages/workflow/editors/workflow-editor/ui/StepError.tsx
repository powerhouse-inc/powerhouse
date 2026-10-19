// A step's error from a run.
export function StepError(props: { error: string }) {
  return (
    <pre className="overflow-auto whitespace-pre-wrap rounded-md bg-wf-fail/10 p-2.5 text-xs text-wf-fail">
      {props.error}
    </pre>
  );
}
