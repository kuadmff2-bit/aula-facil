from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
VERSION = "0.4.16"

sync_path = ROOT / "src" / "cloud-safe-sync.ts"
sync = sync_path.read_text(encoding="utf-8")
import_line = 'import { normalizeFinanceSnapshotForSync } from "./cloud-sync-normalization";\n'
if import_line not in sync:
    anchor = 'import { hydrateProfessionalCloudFields } from "./cloud-professional-fields";\n'
    if anchor not in sync:
        raise SystemExit("Import anchor not found in cloud-safe-sync.ts")
    sync = sync.replace(anchor, anchor + import_line, 1)

old = '''  const database = ensureUuidDatabase(source);\n  if (canWriteFinance(role)) repairMissingEnrollmentInvoices(database);'''
new = '''  let database = ensureUuidDatabase(source);\n  if (canWriteFinance(role)) {\n    repairMissingEnrollmentInvoices(database);\n    database = normalizeFinanceSnapshotForSync(database).database;\n  }'''
if old in sync:
    sync = sync.replace(old, new, 1)
elif new not in sync:
    raise SystemExit("pushSnapshot anchor not found in cloud-safe-sync.ts")
sync_path.write_text(sync, encoding="utf-8")

package_path = ROOT / "package.json"
package = json.loads(package_path.read_text(encoding="utf-8"))
package["version"] = VERSION
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

tauri_path = ROOT / "src-tauri" / "tauri.conf.json"
tauri = json.loads(tauri_path.read_text(encoding="utf-8"))
tauri["version"] = VERSION
tauri_path.write_text(json.dumps(tauri, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

cargo_path = ROOT / "src-tauri" / "Cargo.toml"
cargo = cargo_path.read_text(encoding="utf-8")
cargo, count = re.subn(r'(?m)^version = "[0-9]+\.[0-9]+\.[0-9]+"$', f'version = "{VERSION}"', cargo, count=1)
if count != 1:
    raise SystemExit("Cargo.toml package version not found")
cargo_path.write_text(cargo, encoding="utf-8")

print(f"AulaFácil {VERSION}: deduplicação financeira integrada ao pushSnapshot.")
