interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  'aria-label': string;
}

export function Switch({ checked, onChange, disabled = false, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? 'bg-accent-primary' : 'bg-surface-active'
      }`}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-raised transition-transform duration-150 ${
          checked ? 'translate-x-[18px]' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
