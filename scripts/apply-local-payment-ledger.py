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

invoice_sanitizer_end = '''function sanitizeAttendance(item: unknown): Attendance | null {
'''
payment_sanitizer = '''function sanitizePayment(item: unknown): Payment | null {
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
'''
replace_once(invoice_sanitizer_end, payment_sanitizer, 'payment sanitizer')

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
print('Livro local de pagamentos aplicado com migração retrocompatível.')
