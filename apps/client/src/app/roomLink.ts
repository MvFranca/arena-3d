/** URL desta sala. A barra do navegador usa o mesmo endereço enquanto a sala existe. */
export function roomLink(code: string): string {
  const url = new URL(location.href);
  url.searchParams.set("sala", code);
  url.hash = "";
  return url.toString();
}

export function readSalaParam(): string | null {
  const code = new URLSearchParams(location.search).get("sala")?.trim().toUpperCase() ?? "";
  return code.length >= 4 ? code : null;
}

export function setSalaParam(code: string | null): void {
  const url = new URL(location.href);
  if (code) url.searchParams.set("sala", code);
  else url.searchParams.delete("sala");
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${location.pathname}${location.search}${location.hash}`;
  if (next !== current) history.replaceState(null, "", next);
}
