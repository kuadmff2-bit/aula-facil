from pathlib import Path

path = Path('src/model.ts')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: esperado 1 trecho, encontrado {count}')
    text = text.replace(old, new, 1)

replace_once(
    'export type InvoiceStatus = "pending" | "paid" | "overdue" | "cancelled";\n',
    'export type InvoiceStatus = "pending" | "paid" | "overdue" | "cancelled";\nexport type PaymentStatus = "pending" | "confirmed" | "refunded" | "cancelled" | "failed";\n',
    'payment status',
)

replace_once(
    '''export type Attendance = {
''',
    '''export type Payment = {
  id: string;
  studentId: string;
  invoiceId?: string | null;
  negotiationInstallmentId?: string | null;
  amountReceived: number;
  principalAmount: number;
  lateFeeAmount: number;
  interestAmount: number;
  discountAmount: number;
  paymentMethod: string;
  provider?: string | null;
  providerPaymentId?: string | null;
  status: PaymentStatus;
  paidAt: string | null;
  receiptNumber?: string | null;
  notes?: string;
  createdAt: string;
};

export type Attendance = {
''',
    'payment type',
)

replace_once(
    '''  invoices: Invoice[];
  attendance: Attendance[];
''',
    '''  invoices: Invoice[];
  payments: Payment[];
  attendance: Attendance[];
''',
    'database payments',
)

replace_once(
    'const INVOICE_STATUSES: InvoiceStatus[] = ["pending", "paid", "overdue", "cancelled"];\n',
    'const INVOICE_STATUSES: InvoiceStatus[] = ["pending", "paid", "overdue", "cancelled"];\nconst PAYMENT_STATUSES: PaymentStatus[] = ["pending", "confirmed", "refunded", "cancelled", "failed"];\n',
    'payment statuses',
)

replace_once(
    '''function sanitizeAttendance(item: unknown): Attendance | null {
''',
    '''function sanitizePayment(item: unknown): Payment | null {
  if (!isRecord(item)) return null;
  const id = text(item.id, 180);
  const studentId = text(item.studentId, 180);
  const invoiceId = item.invoiceId === null || item.invoiceId === undefined ? null : text(item.invoiceId, 180) || null;
  const negotiationInstallmentId = item.negotiationInstallmentId === null || item.negotiationInstallmentId === undefined ? null : text(item.negotiationInstallmentId, 180) || null;
  const amountReceived = finiteNumber(item.amountReceived, 0, 100_000_000, null);
  const principalAmount = finiteNumber(item.principalAmount, 0, 100_000_000, null);
  const lateFeeAmount = finiteNumber(item.lateFeeAmount, 0, 100_000_000, null);
  const interestAmount = finiteNumber(item.interestAmount, 0, 100_000_000, null);
  const discountAmount = finiteNumber(item.discountAmount, 0, 100_000_000, null);
  const paymentMethod = text(item.paymentMethod, 40, "manual");
  const status = PAYMENT_STATUSES.includes(item.status as PaymentStatus) ? item.status as PaymentStatus : null;
  const createdAt = text(item.createdAt, 48);
  if (!id || !studentId || (!invoiceId && !negotiationInstallmentId) || amountReceived === null || principalAmount === null || lateFeeAmount === null || interestAmount === null || discountAmount === null || !paymentMethod || !status || !createdAt) return null;
  const expected = Math.round((principalAmount + lateFeeAmount + interestAmount - discountAmount) * 100) / 100;
  if (Math.abs(expected - amountReceived) > 0.011) return null;

  return {
    id,
    studentId,
    invoiceId,
    negotiationInstallmentId,
    amountReceived,
    principalAmount,
    lateFeeAmount,
    interestAmount,
    discountAmount,
    paymentMethod,
    provider: item.provider === null || item.provider === undefined ? null : text(item.provider, 40) || null,
    providerPaymentId: item.providerPaymentId === null || item.providerPaymentId === undefined ? null : text(item.providerPaymentId, 255) || null,
    status,
    paidAt: item.paidAt === null || item.paidAt === undefined ? null : text(item.paidAt, 48) || null,
    receiptNumber: item.receiptNumber === null || item.receiptNumber === undefined ? null : text(item.receiptNumber, 120) || null,
    notes: text(item.notes, 2_000),
    createdAt,
  };
}

function sanitizeAttendance(item: unknown): Attendance | null {
''',
    'payment sanitizer',
)

replace_once(
    '''    invoices: [],
    attendance: [],
''',
    '''    invoices: [],
    payments: [],
    attendance: [],
''',
    'empty payments',
)

replace_once(
    '''    || !validArray(value.invoices)
    || !validArray(value.attendance)
''',
    '''    || !validArray(value.invoices)
    || !validArray(value.payments ?? [])
    || !validArray(value.attendance)
''',
    'validate payments array',
)

replace_once(
    '''  const invoices = sanitizeCollection(value.invoices, sanitizeInvoice);
  const attendance = sanitizeCollection(value.attendance, sanitizeAttendance);
''',
    '''  const invoices = sanitizeCollection(value.invoices, sanitizeInvoice);
  const payments = sanitizeCollection((value.payments ?? []) as unknown[], sanitizePayment);
  const attendance = sanitizeCollection(value.attendance, sanitizeAttendance);
''',
    'sanitize payments',
)

replace_once(
    '''  if (!settings || !students || !classes || !invoices || !attendance || !grades || !notices) return null;
''',
    '''  if (!settings || !students || !classes || !invoices || !payments || !attendance || !grades || !notices) return null;
''',
    'require payments',
)

replace_once(
    '''    invoices,
    attendance,
''',
    '''    invoices,
    payments,
    attendance,
''',
    'return payments',
)

replace_once(
    '''  const studentMap = mapIds(next.students);
  mapIds(next.invoices);
  mapIds(next.attendance);
''',
    '''  const studentMap = mapIds(next.students);
  const invoiceMap = mapIds(next.invoices);
  mapIds(next.payments);
  mapIds(next.attendance);
''',
    'map payment ids',
)

replace_once(
    '''  for (const invoice of next.invoices) invoice.studentId = studentMap.get(invoice.studentId) ?? invoice.studentId;
  for (const item of next.attendance) {
''',
    '''  for (const invoice of next.invoices) invoice.studentId = studentMap.get(invoice.studentId) ?? invoice.studentId;
  for (const payment of next.payments) {
    payment.studentId = studentMap.get(payment.studentId) ?? payment.studentId;
    if (payment.invoiceId) payment.invoiceId = invoiceMap.get(payment.invoiceId) ?? payment.invoiceId;
  }

  const paidInvoiceIds = new Set(next.payments.filter((payment) => payment.invoiceId && payment.status === "confirmed").map((payment) => payment.invoiceId));
  for (const invoice of next.invoices) {
    if (invoice.status !== "paid" || paidInvoiceIds.has(invoice.id)) continue;
    const now = invoice.paidAt ?? invoice.createdAt;
    next.payments.push({
      id: randomUuid(),
      studentId: invoice.studentId,
      invoiceId: invoice.id,
      negotiationInstallmentId: null,
      amountReceived: invoice.amount,
      principalAmount: invoice.amount,
      lateFeeAmount: 0,
      interestAmount: 0,
      discountAmount: 0,
      paymentMethod: "manual",
      provider: null,
      providerPaymentId: null,
      status: "confirmed",
      paidAt: invoice.paidAt,
      receiptNumber: null,
      notes: "Pagamento migrado de versão anterior. Acréscimos históricos não eram registrados separadamente.",
      createdAt: now,
    });
    changed = true;
  }

  for (const item of next.attendance) {
''',
    'migrate payment references',
)

path.write_text(text, encoding='utf-8')

# A mesma alteração precisa existir na camada de nuvem; não aceitamos um modelo
# local com pagamentos que o download/upload online silenciosamente descarte.
cloud_path = Path('src/cloud.ts')
cloud = cloud_path.read_text(encoding='utf-8')


def cloud_replace_once(old: str, new: str, label: str):
    global cloud
    count = cloud.count(old)
    if count != 1:
        raise RuntimeError(f'cloud {label}: esperado 1 trecho, encontrado {count}')
    cloud = cloud.replace(old, new, 1)

cloud_replace_once(
    '''  invoices: number;
  attendance: number;
''',
    '''  invoices: number;
  payments: number;
  attendance: number;
''',
    'summary payment field',
)

cloud_replace_once(
    '''async function countActive(table: string, schoolId: string) {
  const { count, error } = await cloud
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId)
    .is("deleted_at", null);
  if (error) fail(`Não foi possível contar registros de ${table}`, error);
  return count ?? 0;
}

export async function getCloudDataSummary(schoolId: string): Promise<CloudDataSummary> {
  const [classes, students, invoices, attendance, grades, notices] = await Promise.all([
    countActive("classes", schoolId),
    countActive("students", schoolId),
    countActive("invoices", schoolId),
    countActive("attendance", schoolId),
    countActive("grades", schoolId),
    countActive("notices", schoolId),
  ]);
  return {
    classes,
    students,
    invoices,
    attendance,
    grades,
    notices,
    totalOperationalRecords: classes + students + invoices + attendance + grades + notices,
  };
}
''',
    '''async function countActive(table: string, schoolId: string) {
  const { count, error } = await cloud
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId)
    .is("deleted_at", null);
  if (error) fail(`Não foi possível contar registros de ${table}`, error);
  return count ?? 0;
}

async function countRows(table: string, schoolId: string) {
  const { count, error } = await cloud
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId);
  if (error) fail(`Não foi possível contar registros de ${table}`, error);
  return count ?? 0;
}

export async function getCloudDataSummary(schoolId: string): Promise<CloudDataSummary> {
  const [classes, students, invoices, payments, attendance, grades, notices] = await Promise.all([
    countActive("classes", schoolId),
    countActive("students", schoolId),
    countActive("invoices", schoolId),
    countRows("payments", schoolId),
    countActive("attendance", schoolId),
    countActive("grades", schoolId),
    countActive("notices", schoolId),
  ]);
  return {
    classes,
    students,
    invoices,
    payments,
    attendance,
    grades,
    notices,
    totalOperationalRecords: classes + students + invoices + payments + attendance + grades + notices,
  };
}
''',
    'summary logic',
)

cloud_replace_once(
    '''  await upsertRows("attendance", normalized.attendance.map((item) => ({
''',
    '''  await upsertRows("payments", normalized.payments.map((item) => ({
    id: item.id,
    school_id: schoolId,
    student_id: item.studentId,
    invoice_id: item.invoiceId ?? null,
    negotiation_installment_id: item.negotiationInstallmentId ?? null,
    amount_received: item.amountReceived,
    principal_amount: item.principalAmount,
    late_fee_amount: item.lateFeeAmount,
    interest_amount: item.interestAmount,
    discount_amount: item.discountAmount,
    payment_method: item.paymentMethod,
    provider: item.provider ?? null,
    provider_payment_id: item.providerPaymentId ?? null,
    status: item.status,
    paid_at: item.paidAt,
    receipt_number: item.receiptNumber ?? null,
    notes: item.notes ?? null,
    created_at: item.createdAt,
  })));

  await upsertRows("attendance", normalized.attendance.map((item) => ({
''',
    'seed payments',
)

cloud_replace_once(
    '''async function selectActive(table: string, schoolId: string, columns = "*") {
  const { data, error } = await cloud.from(table).select(columns).eq("school_id", schoolId).is("deleted_at", null);
  if (error) fail(`Não foi possível baixar ${table}`, error);
  return data ?? [];
}
''',
    '''async function selectActive(table: string, schoolId: string, columns = "*") {
  const { data, error } = await cloud.from(table).select(columns).eq("school_id", schoolId).is("deleted_at", null);
  if (error) fail(`Não foi possível baixar ${table}`, error);
  return data ?? [];
}

async function selectRows(table: string, schoolId: string, columns = "*") {
  const { data, error } = await cloud.from(table).select(columns).eq("school_id", schoolId);
  if (error) fail(`Não foi possível baixar ${table}`, error);
  return data ?? [];
}
''',
    'select payments helper',
)

cloud_replace_once(
    '''    students,
    invoices,
    attendance,
''',
    '''    students,
    invoices,
    payments,
    attendance,
''',
    'download payment variable',
)

cloud_replace_once(
    '''    selectActive("students", schoolId),
    selectActive("invoices", schoolId),
    selectActive("attendance", schoolId),
''',
    '''    selectActive("students", schoolId),
    selectActive("invoices", schoolId),
    selectRows("payments", schoolId),
    selectActive("attendance", schoolId),
''',
    'download payment query',
)

cloud_replace_once(
    '''    attendance: (attendance as any[]).map((row) => ({
''',
    '''    payments: (payments as any[]).map((row) => ({
      id: String(row.id),
      studentId: String(row.student_id),
      invoiceId: row.invoice_id ? String(row.invoice_id) : null,
      negotiationInstallmentId: row.negotiation_installment_id ? String(row.negotiation_installment_id) : null,
      amountReceived: numeric(row.amount_received),
      principalAmount: numeric(row.principal_amount),
      lateFeeAmount: numeric(row.late_fee_amount),
      interestAmount: numeric(row.interest_amount),
      discountAmount: numeric(row.discount_amount),
      paymentMethod: nullableText(row.payment_method) || "manual",
      provider: row.provider ?? null,
      providerPaymentId: row.provider_payment_id ?? null,
      status: row.status,
      paidAt: row.paid_at ? nullableText(row.paid_at) : null,
      receiptNumber: row.receipt_number ?? null,
      notes: nullableText(row.notes),
      createdAt: nullableText(row.created_at),
    })),
    attendance: (attendance as any[]).map((row) => ({
''',
    'return payments',
)

cloud_path.write_text(cloud, encoding='utf-8')
print('Livro local e sincronização de pagamentos aplicados com migração retrocompatível.')
