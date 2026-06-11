// Campo de formulario del prototipo (js/ui.jsx) en versión no controlada,
// pensado para formularios con server actions.
export function Field({
  label,
  name,
  type = 'text',
  placeholder,
  defaultValue,
  autoFocus,
  error,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
  autoFocus?: boolean;
  error?: string | null;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className={'field-input' + (error ? ' field-error' : '')}
        name={name}
        type={type}
        placeholder={placeholder ?? ''}
        defaultValue={defaultValue}
        autoFocus={!!autoFocus}
      />
      {error ? <span className="field-msg">{error}</span> : null}
    </label>
  );
}
