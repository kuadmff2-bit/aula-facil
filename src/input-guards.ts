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

function prepareDateInput(input: HTMLInputElement) {
  if (input.type !== "date") return;
  if (isBirthDateInput(input)) {
    input.min = MIN_REASONABLE_DATE;
    input.max = localTodayIso();
  } else {
    if (!input.min) input.min = MIN_REASONABLE_DATE;
    if (!input.max) input.max = MAX_REASONABLE_DATE;
  }
}

function validatePhone(input: HTMLInputElement) {
  input.maxLength = Math.min(input.maxLength > 0 ? input.maxLength : 19, 19);
  input.setAttribute("inputmode", "tel");
  input.setCustomValidity(phoneError(input.value, input.required));
  input.setAttribute("aria-invalid", input.validationMessage ? "true" : "false");
}

function validateDate(input: HTMLInputElement) {
  prepareDateInput(input);
  if (isBirthDateInput(input)) {
    input.setCustomValidity(input.value ? birthDateError(input.value) : input.required ? "Informe a data de nascimento." : "");
  } else {
    input.setCustomValidity(genericDateError(input.value));
  }
  input.setAttribute("aria-invalid", input.validationMessage ? "true" : "false");
}

export function installGlobalInputGuards() {
  document.addEventListener("focusin", (event) => {
    if (!isInput(event.target)) return;
    if (isPhoneInput(event.target)) {
      event.target.maxLength = Math.min(event.target.maxLength > 0 ? event.target.maxLength : 19, 19);
      event.target.setAttribute("inputmode", "tel");
      return;
    }
    if (event.target.type === "date") prepareDateInput(event.target);
  }, true);

  document.addEventListener("input", (event) => {
    if (!isInput(event.target)) return;
    if (isPhoneInput(event.target)) {
      validatePhone(event.target);
      return;
    }
    if (event.target.type === "date") {
      // Enquanto o usuário ainda está digitando dia/mês/ano, o WebView pode
      // expor value="" temporariamente. Não transforme isso em erro durante a
      // edição, senão o próprio campo nativo reinicia o segmento digitado.
      prepareDateInput(event.target);
      event.target.setCustomValidity("");
      event.target.setAttribute("aria-invalid", "false");
    }
  }, true);

  const validateCommittedValue = (event: Event) => {
    if (!isInput(event.target)) return;
    if (isPhoneInput(event.target)) {
      validatePhone(event.target);
      return;
    }
    if (event.target.type === "date") validateDate(event.target);
  };

  document.addEventListener("change", validateCommittedValue, true);
  document.addEventListener("blur", validateCommittedValue, true);

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    for (const input of Array.from(form.querySelectorAll<HTMLInputElement>("input"))) {
      if (isPhoneInput(input)) validatePhone(input);
      else if (input.type === "date") validateDate(input);
    }
  }, true);
}
