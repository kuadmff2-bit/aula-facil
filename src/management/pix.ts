import { cents, decimal } from "./format";
const text = (s: string, max: number) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .slice(0, max);
function tlv(id: string, v: string) {
  const n = new TextEncoder().encode(v).length;
  if (n > 99) throw new Error("Campo PIX muito longo.");
  return id + String(n).padStart(2, "0") + v;
}
export function crc16(s: string) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(s)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++)
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    crc &= 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
export function pixPayload(
  key: string,
  name: string,
  city: string,
  amount: string,
  reference: string,
) {
  if (!key.trim() || !text(name, 25) || !text(city, 15))
    throw new Error("Configure a chave PIX, o nome do recebedor e a cidade.");
  const value = cents(amount);
  if (value <= 0) throw new Error("O PIX precisa ter um valor positivo.");
  const txid = reference.replace(/[^a-zA-Z0-9]/g, "").slice(0, 25) || "***";
  const s =
    tlv("00", "01") +
    tlv("26", tlv("00", "br.gov.bcb.pix") + tlv("01", key.trim())) +
    tlv("52", "0000") +
    tlv("53", "986") +
    tlv("54", decimal(value)) +
    tlv("58", "BR") +
    tlv("59", text(name, 25)) +
    tlv("60", text(city, 15)) +
    tlv("62", tlv("05", txid)) +
    "6304";
  return s + crc16(s);
}
