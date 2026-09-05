import { birthDateError, genericDateError, localTodayIso, MAX_REASONABLE_DATE, MIN_REASONABLE_DATE, phoneError } from "./validation";

function isInput(target: EventTarget | null): target is HTMLInputElement {
  return target instanceof HTMLInputElement;
}

function normalizedContext(input: HTMLInputElement) {
  return [
    input.name,
    input.id,
    input.getAttribute("aria-label") ?? "",
    input.placeholder,
    input.closest("label")?.textContent ?? "",
  ].join(" ").toLocaleLowerCase("pt-BR");
}

function isBirthDateInput(input: HTMLInputElement) {
  const context = normalizedContext(input);
  return input.name.toLowerCase() === "birthdate"
    || context.includes("birth")
    || context.includes("nascimento");
}

function isPhoneInput(input: HTMLInputElement) {
  if (input.type === "tel") return true;
  const context = normalizedContext(input);
  return context.includes("telefone") || context.includes("whatsapp") || context.includes("celular") || context.includes("phone");
}

function validateInput(input: HTMLInputElement) {
  if (isPhoneInput(input)) {
    input.maxLength = Math.min(input.maxLength > 0 ? input.maxLength : 19, 19);
    input.setAttribute("inputmode", "tel");
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
    for (const input of Array.from(form.querySelectorAll<HTMLInputElement>("input"))) {
      if (input.type === "date" || isPhoneInput(input)) validateInput(input);
    }
  }, true);
}
