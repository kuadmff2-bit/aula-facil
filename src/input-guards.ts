import { birthDateError, genericDateError, localTodayIso, MAX_REASONABLE_DATE, MIN_REASONABLE_DATE, phoneError } from "./validation";

function isInput(target: EventTarget | null): target is HTMLInputElement {
  return target instanceof HTMLInputElement;
}

function isBirthDateInput(input: HTMLInputElement) {
  const name = input.name.toLowerCase();
  const id = input.id.toLowerCase();
  return name === "birthdate" || name.includes("birth") || id.includes("birth");
}

function validateInput(input: HTMLInputElement) {
  if (input.type === "tel") {
    input.maxLength = Math.min(input.maxLength > 0 ? input.maxLength : 19, 19);
    input.setCustomValidity(phoneError(input.value, input.required));
    input.setAttribute("aria-invalid", input.validationMessage ? "true" : "false");
    return;
  }

  if (input.type !== "date") return;

  if (isBirthDateInput(input)) {
    input.min = MIN_REASONABLE_DATE;
    input.max = localTodayIso();
    input.setCustomValidity(input.value ? birthDateError(input.value) : input.required ? "Informe a data de nascimento." : "");
  } else {
    if (!input.min) input.min = MIN_REASONABLE_DATE;
    if (!input.max) input.max = MAX_REASONABLE_DATE;
    input.setCustomValidity(genericDateError(input.value));
  }
  input.setAttribute("aria-invalid", input.validationMessage ? "true" : "false");
}

export function installGlobalInputGuards() {
  const validateTarget = (event: Event) => {
    if (isInput(event.target)) validateInput(event.target);
  };

  document.addEventListener("input", validateTarget, true);
  document.addEventListener("change", validateTarget, true);
  document.addEventListener("blur", validateTarget, true);
  document.addEventListener("focusin", validateTarget, true);
  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    for (const input of Array.from(form.querySelectorAll<HTMLInputElement>("input[type='date'], input[type='tel']"))) {
      validateInput(input);
    }
  }, true);
}
