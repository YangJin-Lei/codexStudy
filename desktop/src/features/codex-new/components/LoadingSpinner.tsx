import "./LoadingSpinner.css";

type LoadingSpinnerProps = {
  size?: "small" | "medium" | "large";
  text?: string;
  inline?: boolean;
};

export function LoadingSpinner({ size = "medium", text, inline = false }: LoadingSpinnerProps) {
  return (
    <div className={`loading-spinner${inline ? " loading-spinner-inline" : ""}`}>
      <div className={`spinner spinner-${size}`}>
        <div className="spinner-circle" />
      </div>
      {text && <div className="loading-text">{text}</div>}
    </div>
  );
}
