import { describe, expect, it } from "vitest";
import { emptyDatabase } from "./model";
import { localSyncSignature } from "./cloud-safe-sync";

describe("sincronização segura", () => {
  it("não considera updatedAt uma alteração real para proprietário", () => {
    const first = emptyDatabase();
    const second = structuredClone(first);
    second.updatedAt = "2099-01-01T00:00:00.000Z";
    expect(localSyncSignature(first, "owner")).toBe(localSyncSignature(second, "owner"));
  });

  it("continua detectando alteração real de dados", () => {
    const first = emptyDatabase();
    const second = structuredClone(first);
    second.settings.institution.name = "Outra escola";
    expect(localSyncSignature(first, "owner")).not.toBe(localSyncSignature(second, "owner"));
  });
});
