interface Props {
  value: number;
}

export default function ProgressBar({ value }: Props) {
  return (
    <div
      className="progress-bar"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="progress-bar-fill" style={{ width: `${value}%` }} />
    </div>
  );
}
