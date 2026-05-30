type WorkbenchSelectProps<T extends string> = {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
};

export function WorkbenchSelect<T extends string>({
  value,
  options,
  onChange,
  className,
}: WorkbenchSelectProps<T>) {
  return (
    <select
      className={`wb-select${className ? ` ${className}` : ""}`}
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
