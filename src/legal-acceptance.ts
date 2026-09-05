import packageInfo from "../package.json";
import { cloud } from "./cloud";
import { LEGAL_DOCUMENTS, type LegalDocumentType } from "./legal-documents";

export type LegalAcceptanceState = {
  ready: boolean;
  accepted: Record<LegalDocumentType, boolean>;
};

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function currentUserId() {
  const { data, error } = await cloud.auth.getUser();
  if (error || !data.user) throw new Error("Entre na conta do AulaFácil Cloud para registrar o aceite.");
  return data.user.id;
}

export async function getLegalAcceptanceState(schoolId: string | null): Promise<LegalAcceptanceState> {
  const userId = await currentUserId();
  let query = cloud.from("legal_acceptances")
    .select("document_type,document_version,document_sha256")
    .eq("user_id", userId);
  query = schoolId ? query.eq("school_id", schoolId) : query.is("school_id", null);
  const { data, error } = await query;
  if (error) throw new Error(`Não foi possível verificar os termos aceitos: ${error.message}`);

  const expected = await Promise.all(LEGAL_DOCUMENTS.map(async (document) => ({
    type: document.type,
    version: document.version,
    hash: await sha256(document.text),
  })));
  const accepted: Record<LegalDocumentType, boolean> = { terms: false, privacy: false };
  for (const document of expected) {
    accepted[document.type] = (data ?? []).some((row: any) =>
      row.document_type === document.type
      && row.document_version === document.version
      && row.document_sha256 === document.hash,
    );
  }
  return { ready: accepted.terms && accepted.privacy, accepted };
}

export async function acceptCurrentLegalDocuments(schoolId: string | null) {
  const userId = await currentUserId();
  const current = await getLegalAcceptanceState(schoolId);
  const rows = [];
  for (const document of LEGAL_DOCUMENTS) {
    if (current.accepted[document.type]) continue;
    rows.push({
      school_id: schoolId,
      user_id: userId,
      document_type: document.type,
      document_version: document.version,
      app_version: String(packageInfo.version ?? "unknown"),
      acceptance_source: "desktop",
      document_sha256: await sha256(document.text),
    });
  }
  if (rows.length === 0) return;
  const { error } = await cloud.from("legal_acceptances").insert(rows);
  if (error) throw new Error(`Não foi possível registrar o aceite: ${error.message}`);
}

export async function copyCurrentLegalAcceptanceToSchool(schoolId: string) {
  const globalState = await getLegalAcceptanceState(null);
  if (!globalState.ready) return;
  await acceptCurrentLegalDocuments(schoolId);
}
