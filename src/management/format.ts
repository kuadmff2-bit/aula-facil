export function cents(value: string): number {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(normalized))
    throw new Error("Informe um valor positivo com até duas casas decimais.");
  const [whole, fraction = ""] = normalized.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export function decimal(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("Valor inválido.");
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}
export const money = (value: unknown) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value ?? 0),
  );
export const day = (value: unknown) =>
  value ? String(value).slice(0, 10).split("-").reverse().join("/") : "—";
export const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Manaus" }).format(
    new Date(),
  );
export const maskCpf = (value: unknown) => {
  const v = String(value ?? "").replace(/\D/g, "");
  return v.length === 11 ? `***.${v.slice(3, 6)}.${v.slice(6, 9)}-**` : "—";
};
export function whatsapp(phone: string, message: string) {
  let n = phone.replace(/\D/g, "");
  if (n.length === 10 || n.length === 11) n = `55${n}`;
  if (!/^55\d{10,11}$/.test(n))
    throw new Error("Cadastre um telefone válido com DDD.");
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`;
}
export function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) throw new Error("Não há registros para exportar.");
  const keys = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = String(v ?? "");
    return `"${(/^[=+@\-\t\r]/.test(s) ? "'" + s : s).replaceAll('"', '""')}"`;
  };
  const url = URL.createObjectURL(
    new Blob(
      [
        "\ufeff" +
          [keys, ...rows.map((r) => keys.map((k) => r[k]))]
            .map((r) => r.map(cell).join(";"))
            .join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
