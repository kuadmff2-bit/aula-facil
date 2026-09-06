import { CalendarDays } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Props = {
  name: string;
  initialIso?: string;
  min?: string;
  max?: string;
  required?: boolean;
  onIsoChange?: (value: string) => void;
  ariaLabel?: string;
};

function displayFromIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

function digitsToDisplay(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function isoFromDisplay(value: string, min?: string, max?: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 8) return "";
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4));
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (min && iso < min) return "";
  if (max && iso > max) return "";
  return iso;
}

export function DateField({ name, initialIso = "", min, max, required, onIsoChange, ariaLabel }: Props) {
  const [display, setDisplay] = useState(() => displayFromIso(initialIso));
  const [iso, setIso] = useState(() => initialIso);
  const [touched, setTouched] = useState(false);
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDisplay(displayFromIso(initialIso));
    setIso(initialIso);
    setTouched(false);
  }, [initialIso]);

  const applyDisplay = (nextDisplay: string) => {
    const formatted = digitsToDisplay(nextDisplay);
    const nextIso = isoFromDisplay(formatted, min, max);
    setDisplay(formatted);
    setIso(nextIso);
    onIsoChange?.(nextIso);
  };

  const invalid = touched && Boolean(display) && !iso;

  return (
    <span className={`date-field ${invalid ? "invalid" : ""}`}>
      <input type="hidden" name={name} value={iso} />
      <input
        className="date-field-text"
        value={display}
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        placeholder="dd/mm/aaaa"
        aria-label={ariaLabel}
        aria-invalid={invalid}
        onChange={(event) => applyDisplay(event.currentTarget.value)}
        onBlur={() => setTouched(true)}
        required={false}
      />
      <button
        type="button"
        className="date-field-picker-button"
        aria-label="Escolher data no calendário"
        onClick={() => pickerRef.current?.showPicker?.()}
      >
        <CalendarDays size={18} />
      </button>
      <input
        ref={pickerRef}
        className="date-field-native-picker"
        type="date"
        tabIndex={-1}
        min={min}
        max={max}
        value={iso}
        onChange={(event) => {
          const nextIso = event.currentTarget.value;
          setIso(nextIso);
          setDisplay(displayFromIso(nextIso));
          setTouched(true);
          onIsoChange?.(nextIso);
        }}
        aria-hidden="true"
      />
      {required && <span className="date-field-required" aria-hidden="true" />}
      {invalid && <small className="date-field-error">Use uma data válida no formato DD/MM/AAAA.</small>}
    </span>
  );
}
