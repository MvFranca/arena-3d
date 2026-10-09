/** Slider usa as setas para o valor. */
export function consumesArrows(target: EventTarget | null): boolean {
  return isFormField(target) || (target instanceof HTMLInputElement && target.type === "range");
}

/** Texto, número ou lista: setas e Enter já têm função própria. */
export function isFormField(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    const t = target.type;
    return t === "text" || t === "search" || t === "email" || t === "password" || t === "url" || t === "number" || t === "";
  }
  return target instanceof HTMLElement && target.isContentEditable;
}

/** Esc num campo só tira o foco. O próximo Esc volta de tela. */
export function blurFieldOnEscape(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    target.blur();
    return true;
  }
  return false;
}
