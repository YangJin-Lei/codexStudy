type WorkbenchFilterPillsProps<T extends string> = {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
};

export function WorkbenchFilterPills<T extends string>({
  value,
  options,
  onChange,
}: WorkbenchFilterPillsProps<T>) {
  return (
    <div className="wb-filter-pills" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={`wb-filter-pill${value === option.value ? " is-active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
