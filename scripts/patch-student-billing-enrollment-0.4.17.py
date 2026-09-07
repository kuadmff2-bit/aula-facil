from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"{label}: bloco esperado não encontrado em {path}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


# 1) Modelo local: dados bancários/faturamento pertencem à matrícula.
replace_once(
    "src/model.ts",
    """  documentNumber?: string;\n  phone: string;\n  guardianName: string;""",
    """  documentNumber?: string;\n  email?: string;\n  phone: string;\n  postalCode?: string;\n  streetName?: string;\n  streetNumber?: string;\n  neighborhood?: string;\n  city?: string;\n  state?: string;\n  guardianName: string;""",
    "campos Student",
)
replace_once(
    "src/model.ts",
    """    documentNumber: text(student.documentNumber, 40),\n    phone: text(student.phone, 40),\n    guardianName: text(student.guardianName, 200),""",
    """    documentNumber: text(student.documentNumber, 40),\n    email: text(student.email, 200),\n    phone: text(student.phone, 40),\n    postalCode: text(student.postalCode, 20),\n    streetName: text(student.streetName, 200),\n    streetNumber: text(student.streetNumber, 40),\n    neighborhood: text(student.neighborhood, 120),\n    city: text(student.city, 120),\n    state: text(student.state, 2).toUpperCase(),\n    guardianName: text(student.guardianName, 200),""",
    "sanitização Student",
)

# 2) Helper único: matrícula -> BillingProfile e validação de completude.
replace_once(
    "src/billing.ts",
    'import { cloud } from "./cloud";\n',
    'import { cloud } from "./cloud";\nimport type { Student } from "./model";\n',
    "import Student billing",
)
replace_once(
    "src/billing.ts",
    """export const emptyBillingProfile = (): BillingProfile => ({\n  payerName: \"\", email: \"\", documentNumber: \"\", phone: \"\", postalCode: \"\", streetName: \"\",\n  streetNumber: \"\", neighborhood: \"\", city: \"\", state: \"\",\n});\n\n\nexport type BillingProfileErrors""",
    """export const emptyBillingProfile = (): BillingProfile => ({\n  payerName: \"\", email: \"\", documentNumber: \"\", phone: \"\", postalCode: \"\", streetName: \"\",\n  streetNumber: \"\", neighborhood: \"\", city: \"\", state: \"\",\n});\n\nexport function billingProfileFromStudent(student: Student): BillingProfile {\n  return {\n    payerName: student.name ?? \"\",\n    email: student.email ?? \"\",\n    documentNumber: student.documentNumber ?? \"\",\n    phone: student.phone ?? \"\",\n    postalCode: student.postalCode ?? \"\",\n    streetName: student.streetName ?? \"\",\n    streetNumber: student.streetNumber ?? \"\",\n    neighborhood: student.neighborhood ?? \"\",\n    city: student.city ?? \"\",\n    state: (student.state ?? \"\").toUpperCase(),\n  };\n}\n\nconst REQUIRED_BILLING_FIELDS: Array<[keyof BillingProfile, string]> = [\n  [\"payerName\", \"nome do aluno/pagador\"],\n  [\"documentNumber\", \"CPF/CNPJ\"],\n  [\"email\", \"e-mail\"],\n  [\"phone\", \"telefone\"],\n  [\"postalCode\", \"CEP\"],\n  [\"streetName\", \"rua\"],\n  [\"streetNumber\", \"número\"],\n  [\"neighborhood\", \"bairro\"],\n  [\"city\", \"cidade\"],\n  [\"state\", \"UF\"],\n];\n\nexport function requiredBillingProfileError(profile: BillingProfile) {\n  const missing = REQUIRED_BILLING_FIELDS.filter(([key]) => !String(profile[key] ?? \"\").trim()).map(([, label]) => label);\n  if (missing.length) return `Complete na matrícula do aluno: ${missing.join(\", \")}.`;\n  return firstBillingProfileError(profile);\n}\n\n\nexport type BillingProfileErrors""",
    "helpers de faturamento da matrícula",
)

# 3) Cloud push inicial e download.
for path in ["src/cloud.ts", "src/cloud-safe-sync.ts"]:
    replace_once(
        path,
        """    document_number: item.documentNumber?.trim() || \"\",\n    phone: item.phone || \"\",\n    guardian_name: item.guardianName || \"\",""",
        """    document_number: item.documentNumber?.trim() || \"\",\n    email: item.email?.trim() || \"\",\n    phone: item.phone || \"\",\n    postal_code: item.postalCode?.trim() || \"\",\n    street_name: item.streetName?.trim() || \"\",\n    street_number: item.streetNumber?.trim() || \"\",\n    neighborhood: item.neighborhood?.trim() || \"\",\n    city: item.city?.trim() || \"\",\n    state: item.state?.trim().toUpperCase() || \"\",\n    guardian_name: item.guardianName || \"\",""",
        f"push billing student {path}",
    )

replace_once(
    "src/cloud.ts",
    """      documentNumber: nullableText(row.document_number),\n      phone: nullableText(row.phone),\n      guardianName: nullableText(row.guardian_name),""",
    """      documentNumber: nullableText(row.document_number),\n      email: nullableText(row.email),\n      phone: nullableText(row.phone),\n      postalCode: nullableText(row.postal_code),\n      streetName: nullableText(row.street_name),\n      streetNumber: nullableText(row.street_number),\n      neighborhood: nullableText(row.neighborhood),\n      city: nullableText(row.city),\n      state: nullableText(row.state).toUpperCase(),\n      guardianName: nullableText(row.guardian_name),""",
    "download billing student",
)

# 4) Matrícula e edição: coleta + validação + persistência.
replace_once(
    "src/AppNext.tsx",
    'import { invoiceAmountDue } from "./finance-utils";\n',
    'import { invoiceAmountDue } from "./finance-utils";\nimport { requiredBillingProfileError } from "./billing";\n',
    "import billing validation AppNext",
)

student_read_old = """    const documentNumber = formValue(form, \"documentNumber\");\n    const classId = formValue(form, \"classId\");"""
student_read_new = """    const documentNumber = formValue(form, \"documentNumber\");\n    const email = formValue(form, \"email\");\n    const postalCode = formValue(form, \"postalCode\");\n    const streetName = formValue(form, \"streetName\");\n    const streetNumber = formValue(form, \"streetNumber\");\n    const neighborhood = formValue(form, \"neighborhood\");\n    const city = formValue(form, \"city\");\n    const state = formValue(form, \"state\").toUpperCase();\n    const classId = formValue(form, \"classId\");"""
# O bloco aparece em add e edit.
p = Path("src/AppNext.tsx")
s = p.read_text(encoding="utf-8")
if s.count(student_read_new) < 2:
    count = s.count(student_read_old)
    if count < 2:
        raise SystemExit("Leitura dos dados do aluno não encontrada duas vezes")
    s = s.replace(student_read_old, student_read_new, 2)
p.write_text(s, encoding="utf-8")

# addStudent: valida os dados necessários para cobrança.
replace_once(
    "src/AppNext.tsx",
    """    const guardianPhoneError = phoneError(extraFields.guardianPhone, false);\n    if (name.length < 3 || birthError || studentPhoneError || guardianPhoneError || !classById.has(classId) || !Number.isInteger(dueDay) || !database.settings.finance.allowedDueDays.includes(dueDay) || genericDateError(enrollmentStartDate)) {\n      notify(birthError || studentPhoneError || guardianPhoneError || \"Preencha os dados obrigatórios com valores válidos.\", \"danger\");""",
    """    const guardianPhoneError = phoneError(extraFields.guardianPhone, false);\n    const billingError = requiredBillingProfileError({ payerName: name, email, documentNumber, phone: extraFields.phone, postalCode, streetName, streetNumber, neighborhood, city, state });\n    if (name.length < 3 || birthError || studentPhoneError || guardianPhoneError || billingError || !classById.has(classId) || !Number.isInteger(dueDay) || !database.settings.finance.allowedDueDays.includes(dueDay) || genericDateError(enrollmentStartDate)) {\n      notify(birthError || studentPhoneError || guardianPhoneError || billingError || \"Preencha os dados obrigatórios com valores válidos.\", \"danger\");""",
    "validar billing no addStudent",
)
replace_once(
    "src/AppNext.tsx",
    """        id: makeId(\"aluno\"), name, birthDate, documentNumber, classId, dueDay, enrollmentStartDate,\n        enrollmentStatus: \"active\", pausedAt: null, pauseReason: \"\", ...extraFields,""",
    """        id: makeId(\"aluno\"), name, birthDate, documentNumber, email, postalCode, streetName, streetNumber, neighborhood, city, state, classId, dueDay, enrollmentStartDate,\n        enrollmentStatus: \"active\", pausedAt: null, pauseReason: \"\", ...extraFields,""",
    "persistir billing addStudent",
)

# editStudent: valida e persiste.
replace_once(
    "src/AppNext.tsx",
    """    const guardianPhoneError = phoneError(extraFields.guardianPhone, false);\n    if (name.length < 3 || birthError || studentPhoneError || guardianPhoneError || !classById.has(classId) || !Number.isInteger(dueDay) || !database.settings.finance.allowedDueDays.includes(dueDay)) {\n      notify(birthError || studentPhoneError || guardianPhoneError || \"Revise os dados do aluno.\", \"danger\");""",
    """    const guardianPhoneError = phoneError(extraFields.guardianPhone, false);\n    const billingError = requiredBillingProfileError({ payerName: name, email, documentNumber, phone: extraFields.phone, postalCode, streetName, streetNumber, neighborhood, city, state });\n    if (name.length < 3 || birthError || studentPhoneError || guardianPhoneError || billingError || !classById.has(classId) || !Number.isInteger(dueDay) || !database.settings.finance.allowedDueDays.includes(dueDay)) {\n      notify(birthError || studentPhoneError || guardianPhoneError || billingError || \"Revise os dados do aluno.\", \"danger\");""",
    "validar billing no editStudent",
)
replace_once(
    "src/AppNext.tsx",
    """      Object.assign(target, { name, birthDate, documentNumber, classId, ...extraFields });""",
    """      Object.assign(target, { name, birthDate, documentNumber, email, postalCode, streetName, streetNumber, neighborhood, city, state, classId, ...extraFields });""",
    "persistir billing editStudent",
)

# Formulários: documento passa a ser CPF/CNPJ obrigatório e endereço/e-mail entram na matrícula.
p = Path("src/AppNext.tsx")
s = p.read_text(encoding="utf-8")
s = s.replace('<Field label="CPF / documento"><input name="documentNumber" maxLength={40} inputMode="numeric" placeholder="CPF ou documento"/></Field>', '<Field label="CPF/CNPJ"><input name="documentNumber" maxLength={18} inputMode="numeric" placeholder="Somente números" required/></Field>', 1)
s = s.replace('<Field label="CPF / documento"><input name="documentNumber" maxLength={40} inputMode="numeric" defaultValue={selectedStudent.documentNumber ?? ""}/></Field>', '<Field label="CPF/CNPJ"><input name="documentNumber" maxLength={18} inputMode="numeric" defaultValue={selectedStudent.documentNumber ?? ""} required/></Field>', 1)
new_fields_add = '''<div className="form-note wide"><WalletCards size={19}/><span>Dados de cobrança: ficam salvos na matrícula e serão usados automaticamente para gerar Pix e boleto. Você não precisará digitá-los novamente no Financeiro.</span></div><Field label="E-mail"><input name="email" type="email" maxLength={200} required/></Field><Field label="CEP"><input name="postalCode" inputMode="numeric" maxLength={9} placeholder="Somente números" required/></Field><Field label="Rua" wide><input name="streetName" maxLength={200} required/></Field><Field label="Número"><input name="streetNumber" maxLength={40} required/></Field><Field label="Bairro"><input name="neighborhood" maxLength={120} required/></Field><Field label="Cidade"><input name="city" maxLength={120} required/></Field><Field label="UF"><input name="state" maxLength={2} minLength={2} pattern="[A-Za-z]{2}" placeholder="AM" required/></Field>'''
needle_add = '<StudentExtraFieldsForm fields={database.settings.studentFields} birthDate={studentBirthDate}/>'
if new_fields_add not in s:
    if needle_add not in s:
        raise SystemExit('StudentExtraFieldsForm add não encontrado')
    s = s.replace(needle_add, new_fields_add + needle_add, 1)
new_fields_edit = '''<div className="form-note wide"><WalletCards size={19}/><span>Dados de cobrança: o Financeiro usa estes dados automaticamente para Pix e boleto.</span></div><Field label="E-mail"><input name="email" type="email" maxLength={200} defaultValue={selectedStudent.email ?? ""} required/></Field><Field label="CEP"><input name="postalCode" inputMode="numeric" maxLength={9} defaultValue={selectedStudent.postalCode ?? ""} required/></Field><Field label="Rua" wide><input name="streetName" maxLength={200} defaultValue={selectedStudent.streetName ?? ""} required/></Field><Field label="Número"><input name="streetNumber" maxLength={40} defaultValue={selectedStudent.streetNumber ?? ""} required/></Field><Field label="Bairro"><input name="neighborhood" maxLength={120} defaultValue={selectedStudent.neighborhood ?? ""} required/></Field><Field label="Cidade"><input name="city" maxLength={120} defaultValue={selectedStudent.city ?? ""} required/></Field><Field label="UF"><input name="state" maxLength={2} minLength={2} pattern="[A-Za-z]{2}" defaultValue={selectedStudent.state ?? ""} required/></Field>'''
needle_edit = '<StudentEditExtraFields student={selectedStudent} fields={database.settings.studentFields} birthDate={editBirthDate}/>'
if new_fields_edit not in s:
    if needle_edit not in s:
        raise SystemExit('StudentEditExtraFields não encontrado')
    s = s.replace(needle_edit, new_fields_edit + needle_edit, 1)
p.write_text(s, encoding="utf-8")

# 5) Financeiro: somente lê dados da matrícula; não pede redigitação.
p = Path("src/finance-ultimate.tsx")
s = p.read_text(encoding="utf-8")
s = s.replace('cancelProviderCharge, emptyBillingProfile, firstBillingProfileError, generateProviderCharge, getBillingProfile, getBillingProfileErrors, requestProviderRefund, saveBillingProfile, type BillingProfile, type GeneratedCharge', 'billingProfileFromStudent, cancelProviderCharge, emptyBillingProfile, generateProviderCharge, getBillingProfileErrors, requestProviderRefund, requiredBillingProfileError, saveBillingProfile, type BillingProfile, type GeneratedCharge')
old_open = '''  const openCharge = async (invoice: Invoice) => {\n    setNotice(null);\n    const student = students.get(invoice.studentId);\n    if (!student) return;\n    const schoolId = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? \"\";\n    if (!schoolId) {\n      setNotice({ tone: \"warning\", text: \"Conecte o AulaFácil Cloud e selecione a instituição antes de gerar cobrança bancária.\" });\n      return;\n    }\n    setBusy(true);\n    setGeneratedCharge(null);\n    try {\n      setBilling(await getBillingProfile(schoolId, student.id));\n      setModal({ kind: \"charge\", invoice, student });\n    } catch (error) {\n      setNotice({ tone: \"danger\", text: error instanceof Error ? error.message : \"Não foi possível carregar o faturamento.\" });\n    } finally { setBusy(false); }\n  };'''
new_open = '''  const openCharge = (invoice: Invoice) => {\n    setNotice(null);\n    const student = students.get(invoice.studentId);\n    if (!student) return;\n    const schoolId = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? \"\";\n    if (!schoolId) {\n      setNotice({ tone: \"warning\", text: \"Conecte o AulaFácil Cloud e selecione a instituição antes de gerar cobrança bancária.\" });\n      return;\n    }\n    const profile = billingProfileFromStudent(student);\n    setBilling(profile);\n    setGeneratedCharge(null);\n    setModal({ kind: \"charge\", invoice, student });\n    const profileError = requiredBillingProfileError(profile);\n    if (profileError) setNotice({ tone: \"danger\", text: `${profileError} Feche esta janela, abra o cadastro do aluno e complete os dados uma única vez.` });\n  };'''
if new_open not in s:
    if old_open not in s:
        raise SystemExit('openCharge antigo não encontrado')
    s = s.replace(old_open, new_open, 1)
s = s.replace('const billingError = firstBillingProfileError(billing);', 'const billingError = requiredBillingProfileError(billing);', 1)
s = s.replace('<p>{modal.student.name} · os dados abaixo são usados somente quando o provedor exigir.</p>', '<p>{modal.student.name} · dados carregados automaticamente da matrícula.</p>', 1)
# Torna os dados somente leitura na tela financeira.
repls = {
'value={billing.documentNumber} onChange={(e) => setBilling({...billing, documentNumber:e.target.value})}': 'value={billing.documentNumber} readOnly',
'value={billing.email} onChange={(e) => setBilling({...billing, email:e.target.value})}': 'value={billing.email} readOnly',
'value={billing.phone} onChange={(e) => setBilling({...billing, phone:e.target.value})}': 'value={billing.phone} readOnly',
'value={billing.postalCode} onChange={(e) => setBilling({...billing, postalCode:e.target.value})}': 'value={billing.postalCode} readOnly',
'value={billing.streetName} onChange={(e) => setBilling({...billing, streetName:e.target.value})}': 'value={billing.streetName} readOnly',
'value={billing.streetNumber} onChange={(e) => setBilling({...billing, streetNumber:e.target.value})}': 'value={billing.streetNumber} readOnly',
'value={billing.neighborhood} onChange={(e) => setBilling({...billing, neighborhood:e.target.value})}': 'value={billing.neighborhood} readOnly',
'value={billing.city} onChange={(e) => setBilling({...billing, city:e.target.value})}': 'value={billing.city} readOnly',
'value={billing.state} onChange={(e) => setBilling({...billing, state:e.target.value.toUpperCase()})}': 'value={billing.state} readOnly',
}
for old, new in repls.items():
    if old in s:
        s = s.replace(old, new, 1)
    elif new not in s:
        raise SystemExit(f'Campo financeiro editável não localizado: {old[:40]}')
marker = '<div className="billing-grid"><label><span>Método</span>'
info = '<div className="payment-message success" role="status"><strong>Dados da matrícula</strong><span>CPF/CNPJ, e-mail, telefone e endereço são preenchidos automaticamente. Para alterar algum dado, edite o cadastro do aluno.</span></div>'
if info not in s:
    if marker not in s:
        raise SystemExit('billing-grid não encontrado')
    s = s.replace(marker, info + marker, 1)
p.write_text(s, encoding="utf-8")

# 6) Backend: matrícula é fonte primária, perfil antigo fica apenas como compatibilidade/cache.
p = Path('supabase/functions/payment-charge/index.ts')
s = p.read_text(encoding='utf-8')
old = '    payer_name:"",email:"",document_number:"",phone:normalizeBrazilPhone(student.phone??""),postal_code:"",street_name:"",street_number:"",neighborhood:"",city:"",state:"",\n    ...(existingProfileResult.data??{}),...profilePatch,'
new = '    payer_name:clean(student.name,180),email:clean(student.email,200),document_number:digits(student.document_number).slice(0,30),phone:normalizeBrazilPhone(student.phone??""),postal_code:digits(student.postal_code).slice(0,12),street_name:clean(student.street_name,200),street_number:clean(student.street_number,40),neighborhood:clean(student.neighborhood,120),city:clean(student.city,120),state:clean(student.state,10).toUpperCase(),\n    ...(existingProfileResult.data??{}),...profilePatch,'
if new not in s:
    if old not in s:
        raise SystemExit('Defaults do BillingProfile backend não encontrados')
    s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')

print('Patch de dados de cobrança na matrícula aplicado com sucesso.')
