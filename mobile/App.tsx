import { StatusBar } from "expo-status-bar";
import * as Clipboard from "expo-clipboard";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  confirmManualPayment,
  generateCharge,
  listSchools,
  loadInvoices,
  loadPayments,
  loadStudents,
  signIn,
  signOut,
  supabase,
  type ChargeResult,
  type MobileInvoice,
  type MobilePayment,
  type MobileSchool,
  type MobileStudent,
} from "./src/api";

type Tab = "home" | "students" | "finance" | "more";
type ChargeState = {
  invoice: MobileInvoice;
  studentName: string;
  result?: ChargeResult;
} | null;

const C = {
  bg: "#081225",
  surface: "#0f1b31",
  surface2: "#152440",
  border: "#263a60",
  text: "#f6f8ff",
  muted: "#9eabc4",
  primary: "#377bff",
  gold: "#f2b134",
  success: "#22c55e",
  danger: "#ef4444",
  warning: "#f59e0b",
};

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function dateLabel(value: string) {
  if (!value) return "—";
  const iso = value.slice(0, 10);
  const [year, month, day] = iso.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function effectiveStatus(invoice: MobileInvoice) {
  if (["paid", "cancelled", "negotiated"].includes(invoice.status)) return invoice.status;
  const today = new Date().toISOString().slice(0, 10);
  return invoice.dueDate < today ? "overdue" : "pending";
}

function statusLabel(status: string) {
  if (status === "paid") return "Pago";
  if (status === "overdue") return "Atrasado";
  if (status === "cancelled") return "Cancelado";
  if (status === "negotiated") return "Renegociado";
  return "Pendente";
}

function statusColor(status: string) {
  if (status === "paid") return C.success;
  if (status === "overdue") return C.danger;
  if (status === "cancelled" || status === "negotiated") return C.muted;
  return C.warning;
}

function ActionButton({
  label,
  onPress,
  tone = "primary",
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  tone?: "primary" | "gold" | "ghost" | "danger";
  disabled?: boolean;
}) {
  const backgroundColor = tone === "gold" ? C.gold : tone === "danger" ? C.danger : tone === "ghost" ? C.surface2 : C.primary;
  const color = tone === "gold" ? "#1c2638" : C.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, { backgroundColor }, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <Text style={[styles.actionButtonText, { color }]}>{label}</Text>
    </Pressable>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>◎</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  const [schools, setSchools] = useState<MobileSchool[]>([]);
  const [school, setSchool] = useState<MobileSchool | null>(null);
  const [students, setStudents] = useState<MobileStudent[]>([]);
  const [invoices, setInvoices] = useState<MobileInvoice[]>([]);
  const [payments, setPayments] = useState<MobilePayment[]>([]);
  const [tab, setTab] = useState<Tab>("home");
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [charge, setCharge] = useState<ChargeState>(null);
  const [schoolPicker, setSchoolPicker] = useState(false);

  const studentMap = useMemo(() => new Map(students.map((item) => [item.id, item])), [students]);

  const metrics = useMemo(() => {
    let pending = 0;
    let overdue = 0;
    let openValue = 0;
    for (const invoice of invoices) {
      const status = effectiveStatus(invoice);
      if (status === "pending" || status === "overdue") {
        pending += 1;
        openValue += invoice.amount;
      }
      if (status === "overdue") overdue += 1;
    }
    const month = new Date().toISOString().slice(0, 7);
    const receivedMonth = payments
      .filter((item) => item.status === "confirmed" && item.paidAt.slice(0, 7) === month)
      .reduce((sum, item) => sum + item.amountReceived, 0);
    return { pending, overdue, openValue, receivedMonth };
  }, [invoices, payments]);

  const visibleStudents = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    if (!q) return students;
    return students.filter((item) => `${item.name} ${item.phone} ${item.guardianName} ${item.guardianPhone}`.toLocaleLowerCase("pt-BR").includes(q));
  }, [students, query]);

  const visibleInvoices = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    return invoices
      .filter((item) => {
        const student = studentMap.get(item.studentId);
        if (!q) return true;
        return `${student?.name ?? ""} ${item.reference} ${statusLabel(effectiveStatus(item))}`.toLocaleLowerCase("pt-BR").includes(q);
      })
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  }, [invoices, query, studentMap]);

  const loadSchoolData = async (selected: MobileSchool, silent = false) => {
    if (!silent) setLoadingData(true);
    try {
      const [nextStudents, nextInvoices, nextPayments] = await Promise.all([
        loadStudents(selected.id),
        loadInvoices(selected.id),
        loadPayments(selected.id),
      ]);
      setStudents(nextStudents);
      setInvoices(nextInvoices);
      setPayments(nextPayments);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar os dados.");
    } finally {
      if (!silent) setLoadingData(false);
    }
  };

  const loadAccount = async () => {
    const nextSchools = await listSchools();
    setSchools(nextSchools);
    const selected = school && nextSchools.some((item) => item.id === school.id)
      ? nextSchools.find((item) => item.id === school.id) ?? null
      : nextSchools[0] ?? null;
    setSchool(selected);
    if (selected) await loadSchoolData(selected);
  };

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      const ok = Boolean(data.session);
      setAuthenticated(ok);
      if (ok) {
        try { await loadAccount(); } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao carregar a conta."); }
      }
      if (mounted) setBooting(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setAuthenticated(Boolean(session));
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && authenticated && school) void loadSchoolData(school, true);
    });
    return () => subscription.remove();
  }, [authenticated, school]);

  const login = async () => {
    if (authBusy) return;
    setAuthBusy(true);
    setAuthError("");
    try {
      await signIn(email, password);
      setAuthenticated(true);
      await loadAccount();
      setPassword("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Não foi possível entrar.");
    } finally {
      setAuthBusy(false);
      setBooting(false);
    }
  };

  const refresh = async () => {
    if (!school || refreshing) return;
    setRefreshing(true);
    await loadSchoolData(school, true);
    setRefreshing(false);
  };

  const selectSchool = async (item: MobileSchool) => {
    setSchoolPicker(false);
    setSchool(item);
    setQuery("");
    await loadSchoolData(item);
  };

  const startCharge = (invoice: MobileInvoice) => {
    const status = effectiveStatus(invoice);
    if (status !== "pending" && status !== "overdue") {
      Alert.alert("Cobrança indisponível", "Esta mensalidade não está aberta para cobrança.");
      return;
    }
    setCharge({ invoice, studentName: studentMap.get(invoice.studentId)?.name ?? "Aluno" });
  };

  const createCharge = async (method: "pix" | "boleto") => {
    if (!charge || actionBusy) return;
    setActionBusy(true);
    try {
      const result = await generateCharge(charge.invoice.id, method);
      setCharge({ ...charge, result });
      await refresh();
    } catch (error) {
      Alert.alert("Não foi possível gerar", error instanceof Error ? error.message : "A cobrança não pôde ser criada.");
    } finally {
      setActionBusy(false);
    }
  };

  const receiveCash = (invoice: MobileInvoice) => {
    if (!school || actionBusy) return;
    const student = studentMap.get(invoice.studentId);
    Alert.alert(
      "Confirmar recebimento",
      `Registrar ${money(invoice.amount)} de ${student?.name ?? "aluno"} como recebido em dinheiro?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Confirmar",
          onPress: () => void (async () => {
            setActionBusy(true);
            try {
              await confirmManualPayment({ schoolId: school.id, invoiceId: invoice.id, method: "dinheiro" });
              await loadSchoolData(school, true);
              Alert.alert("Pagamento confirmado", "A mensalidade foi baixada no servidor e o recibo foi registrado.");
            } catch (error) {
              Alert.alert("Não foi possível receber", error instanceof Error ? error.message : "Falha ao registrar o pagamento.");
            } finally {
              setActionBusy(false);
            }
          })(),
        },
      ],
    );
  };

  const logout = async () => {
    await signOut();
    setAuthenticated(false);
    setSchool(null);
    setSchools([]);
    setStudents([]);
    setInvoices([]);
    setPayments([]);
    setTab("home");
  };

  if (booting) {
    return (
      <View style={styles.centerScreen}>
        <StatusBar style="light" />
        <View style={styles.logo}><Text style={styles.logoLetter}>F</Text><View style={styles.logoDot} /></View>
        <ActivityIndicator color={C.gold} size="large" />
        <Text style={styles.bootText}>Abrindo AulaFácil...</Text>
      </View>
    );
  }

  if (!authenticated) {
    return (
      <View style={styles.loginScreen}>
        <StatusBar style="light" />
        <View style={styles.loginCard}>
          <View style={styles.logo}><Text style={styles.logoLetter}>F</Text><View style={styles.logoDot} /></View>
          <Text style={styles.loginTitle}>AulaFácil</Text>
          <Text style={styles.loginSubtitle}>Sua escola na palma da mão.</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="E-mail"
            placeholderTextColor={C.muted}
            value={email}
            onChangeText={setEmail}
            style={styles.input}
          />
          <TextInput
            autoCapitalize="none"
            autoComplete="password"
            placeholder="Senha"
            placeholderTextColor={C.muted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => void login()}
            style={styles.input}
          />
          {authError ? <Text style={styles.errorText}>{authError}</Text> : null}
          <ActionButton label={authBusy ? "Entrando..." : "Entrar"} onPress={() => void login()} tone="gold" disabled={authBusy} />
          <Text style={styles.helper}>Use a mesma conta do AulaFácil no computador.</Text>
        </View>
      </View>
    );
  }

  if (!school) {
    return (
      <View style={styles.centerScreen}>
        <StatusBar style="light" />
        <Empty title="Nenhuma instituição" text="Sua conta ainda não possui uma instituição ativa." />
        <ActionButton label="Sair" onPress={() => void logout()} tone="ghost" />
      </View>
    );
  }

  return (
    <View style={styles.app}>
      <StatusBar style="light" />
      <View style={styles.topbar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>AulaFácil</Text>
          <Pressable onPress={() => schools.length > 1 && setSchoolPicker(true)}>
            <Text numberOfLines={1} style={styles.schoolName}>{school.name}{schools.length > 1 ? "  ▾" : ""}</Text>
          </Pressable>
        </View>
        <Pressable style={styles.syncButton} onPress={() => void refresh()} disabled={refreshing}>
          <Text style={styles.syncButtonText}>{refreshing ? "..." : "↻"}</Text>
        </Pressable>
      </View>

      {message ? <View style={styles.message}><Text style={styles.messageText}>{message}</Text></View> : null}

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={C.gold} colors={[C.primary]} />}
        keyboardShouldPersistTaps="handled"
      >
        {loadingData ? <ActivityIndicator color={C.gold} style={{ marginTop: 40 }} /> : null}

        {!loadingData && tab === "home" ? (
          <>
            <Text style={styles.pageEyebrow}>VISÃO RÁPIDA</Text>
            <Text style={styles.pageTitle}>Hoje na sua escola</Text>
            <Text style={styles.pageSubtitle}>Só o que você precisa para agir rápido.</Text>

            <View style={styles.metricsGrid}>
              <View style={styles.metric}><Text style={styles.metricValue}>{students.length}</Text><Text style={styles.metricLabel}>Alunos</Text></View>
              <View style={styles.metric}><Text style={styles.metricValue}>{metrics.pending}</Text><Text style={styles.metricLabel}>Em aberto</Text></View>
              <View style={[styles.metric, metrics.overdue > 0 && { borderColor: C.danger }]}><Text style={[styles.metricValue, metrics.overdue > 0 && { color: C.danger }]}>{metrics.overdue}</Text><Text style={styles.metricLabel}>Atrasadas</Text></View>
              <View style={styles.metric}><Text style={[styles.metricValue, { fontSize: 18 }]}>{money(metrics.receivedMonth)}</Text><Text style={styles.metricLabel}>Recebido no mês</Text></View>
            </View>

            <View style={styles.highlightCard}>
              <Text style={styles.highlightKicker}>VALOR EM ABERTO</Text>
              <Text style={styles.highlightValue}>{money(metrics.openValue)}</Text>
              <Text style={styles.highlightText}>Toque em Financeiro para cobrar ou receber uma mensalidade.</Text>
              <ActionButton label="Abrir financeiro" onPress={() => setTab("finance")} tone="gold" />
            </View>

            <Text style={styles.sectionTitle}>Próximas ações</Text>
            {visibleInvoices.filter((item) => ["pending", "overdue"].includes(effectiveStatus(item))).slice(0, 4).map((invoice) => {
              const student = studentMap.get(invoice.studentId);
              const status = effectiveStatus(invoice);
              return (
                <View key={invoice.id} style={styles.listCard}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={styles.listTitle}>{student?.name ?? "Aluno"}</Text>
                    <Text style={styles.listMeta}>{invoice.reference} • vence {dateLabel(invoice.dueDate)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text style={styles.listAmount}>{money(invoice.amount)}</Text>
                    <Text style={[styles.statusText, { color: statusColor(status) }]}>{statusLabel(status)}</Text>
                  </View>
                </View>
              );
            })}
          </>
        ) : null}

        {!loadingData && tab === "students" ? (
          <>
            <Text style={styles.pageEyebrow}>ALUNOS</Text>
            <Text style={styles.pageTitle}>{students.length} cadastrados</Text>
            <TextInput
              placeholder="Buscar aluno ou responsável"
              placeholderTextColor={C.muted}
              value={query}
              onChangeText={setQuery}
              style={styles.search}
            />
            {visibleStudents.length ? visibleStudents.map((student) => (
              <View key={student.id} style={styles.listCardColumn}>
                <View style={styles.rowBetween}>
                  <Text style={styles.listTitle}>{student.name}</Text>
                  <Text style={[styles.statusChip, { color: student.enrollmentStatus === "active" ? C.success : C.warning }]}>
                    {student.enrollmentStatus === "active" ? "Ativo" : "Pausado"}
                  </Text>
                </View>
                <Text style={styles.listMeta}>{student.phone || "Sem telefone"}</Text>
                {student.guardianName ? <Text style={styles.listMeta}>Responsável: {student.guardianName} {student.guardianPhone ? `• ${student.guardianPhone}` : ""}</Text> : null}
              </View>
            )) : <Empty title="Nenhum aluno encontrado" text="Tente outro nome ou telefone." />}
          </>
        ) : null}

        {!loadingData && tab === "finance" ? (
          <>
            <Text style={styles.pageEyebrow}>FINANCEIRO</Text>
            <Text style={styles.pageTitle}>Mensalidades</Text>
            <Text style={styles.pageSubtitle}>Cobrar, receber e conferir sem sair da tela.</Text>
            <TextInput
              placeholder="Buscar aluno ou referência"
              placeholderTextColor={C.muted}
              value={query}
              onChangeText={setQuery}
              style={styles.search}
            />
            {visibleInvoices.length ? visibleInvoices.map((invoice) => {
              const student = studentMap.get(invoice.studentId);
              const status = effectiveStatus(invoice);
              const open = status === "pending" || status === "overdue";
              return (
                <View key={invoice.id} style={styles.invoiceCard}>
                  <View style={styles.rowBetween}>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={styles.listTitle}>{student?.name ?? "Aluno"}</Text>
                      <Text style={styles.listMeta}>{invoice.reference} • {dateLabel(invoice.dueDate)}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.listAmount}>{money(invoice.amount)}</Text>
                      <Text style={[styles.statusText, { color: statusColor(status) }]}>{statusLabel(status)}</Text>
                    </View>
                  </View>
                  {open ? (
                    <View style={styles.invoiceActions}>
                      <ActionButton label="Pix / boleto" onPress={() => startCharge(invoice)} tone="gold" disabled={actionBusy} />
                      <ActionButton label="Receber" onPress={() => receiveCash(invoice)} tone="ghost" disabled={actionBusy} />
                    </View>
                  ) : invoice.providerChargeId ? (
                    <Text style={styles.providerNote}>Cobrança {invoice.provider || "bancária"} vinculada.</Text>
                  ) : null}
                </View>
              );
            }) : <Empty title="Nenhuma mensalidade" text="Não há resultados para esta busca." />}
          </>
        ) : null}

        {!loadingData && tab === "more" ? (
          <>
            <Text style={styles.pageEyebrow}>MAIS</Text>
            <Text style={styles.pageTitle}>Conta e recibos</Text>
            <View style={styles.accountCard}>
              <Text style={styles.listTitle}>{school.name}</Text>
              <Text style={styles.listMeta}>Acesso: {school.role || "usuário"}</Text>
              <Text style={styles.listMeta}>Os dados deste celular vêm da mesma nuvem do desktop.</Text>
            </View>

            <Text style={styles.sectionTitle}>Recebimentos recentes</Text>
            {payments.slice(0, 12).map((payment) => {
              const student = studentMap.get(payment.studentId);
              return (
                <View key={payment.id} style={styles.listCard}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={styles.listTitle}>{student?.name ?? "Aluno"}</Text>
                    <Text style={styles.listMeta}>{dateLabel(payment.paidAt)} • {payment.method || "pagamento"}</Text>
                    {payment.receiptNumber ? <Text style={styles.receipt}>Recibo {payment.receiptNumber}</Text> : null}
                  </View>
                  <Text style={styles.listAmount}>{money(payment.amountReceived)}</Text>
                </View>
              );
            })}
            {!payments.length ? <Empty title="Sem recebimentos" text="Os pagamentos confirmados aparecerão aqui." /> : null}
            <View style={{ height: 10 }} />
            <ActionButton label="Atualizar agora" onPress={() => void refresh()} tone="ghost" />
            <ActionButton label="Sair da conta" onPress={() => void logout()} tone="danger" />
          </>
        ) : null}
      </ScrollView>

      <View style={styles.bottomNav}>
        {([
          ["home", "⌂", "Início"],
          ["students", "♙", "Alunos"],
          ["finance", "$", "Financeiro"],
          ["more", "•••", "Mais"],
        ] as const).map(([key, icon, label]) => (
          <Pressable key={key} style={styles.navItem} onPress={() => { setTab(key); setQuery(""); }}>
            <Text style={[styles.navIcon, tab === key && styles.navActive]}>{icon}</Text>
            <Text style={[styles.navLabel, tab === key && styles.navActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <Modal transparent visible={Boolean(charge)} animationType="slide" onRequestClose={() => setCharge(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            {charge ? (
              <>
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetTitle}>{charge.result ? "Cobrança pronta" : "Como deseja cobrar?"}</Text>
                <Text style={styles.sheetSubtitle}>{charge.studentName} • {charge.invoice.reference} • {money(charge.invoice.amount)}</Text>
                {!charge.result ? (
                  <>
                    <Text style={styles.sheetInfo}>Os dados do pagador são puxados automaticamente da matrícula. Você não precisa preencher tudo de novo.</Text>
                    <ActionButton label={actionBusy ? "Gerando..." : "Gerar Pix"} onPress={() => void createCharge("pix")} tone="gold" disabled={actionBusy} />
                    <ActionButton label={actionBusy ? "Gerando..." : "Gerar boleto"} onPress={() => void createCharge("boleto")} tone="primary" disabled={actionBusy} />
                  </>
                ) : (
                  <View style={{ gap: 12 }}>
                    <View style={styles.chargeResult}>
                      <Text style={styles.highlightKicker}>{charge.result.environment === "sandbox" ? "AMBIENTE DE TESTE" : "COBRANÇA"}</Text>
                      <Text style={styles.chargeAmount}>{money(charge.result.amount)}</Text>
                      <Text style={styles.listMeta}>Provedor: {charge.result.provider || "configurado"}{charge.result.reused ? " • cobrança existente" : ""}</Text>
                    </View>
                    {charge.result.pixCopyPaste ? (
                      <>
                        <Text numberOfLines={3} style={styles.pixCode}>{charge.result.pixCopyPaste}</Text>
                        <ActionButton label="Copiar Pix" onPress={() => void Clipboard.setStringAsync(charge.result?.pixCopyPaste ?? "")} tone="gold" />
                      </>
                    ) : null}
                    {charge.result.boletoUrl || charge.result.paymentUrl || charge.result.publicPaymentUrl ? (
                      <ActionButton label="Abrir cobrança" onPress={() => {
                        const url = charge.result?.boletoUrl || charge.result?.paymentUrl || charge.result?.publicPaymentUrl;
                        if (url) void Linking.openURL(url);
                      }} tone="primary" />
                    ) : null}
                  </View>
                )}
                <ActionButton label="Fechar" onPress={() => setCharge(null)} tone="ghost" />
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal transparent visible={schoolPicker} animationType="fade" onRequestClose={() => setSchoolPicker(false)}>
        <View style={styles.modalBackdropCenter}>
          <View style={styles.pickerCard}>
            <Text style={styles.sheetTitle}>Escolher instituição</Text>
            {schools.map((item) => (
              <Pressable key={item.id} style={[styles.schoolOption, item.id === school.id && { borderColor: C.gold }]} onPress={() => void selectSchool(item)}>
                <Text style={styles.listTitle}>{item.name}</Text>
                <Text style={styles.listMeta}>{item.role}</Text>
              </Pressable>
            ))}
            <ActionButton label="Cancelar" onPress={() => setSchoolPicker(false)} tone="ghost" />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: C.bg, paddingTop: 42 },
  centerScreen: { flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 },
  loginScreen: { flex: 1, backgroundColor: C.bg, justifyContent: "center", padding: 22 },
  loginCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 22, gap: 13 },
  logo: { width: 58, height: 58, borderRadius: 18, backgroundColor: "#0d2d73", alignItems: "center", justifyContent: "center", position: "relative" },
  logoLetter: { color: "#fff", fontWeight: "900", fontSize: 32 },
  logoDot: { position: "absolute", top: 4, right: 4, width: 15, height: 15, borderRadius: 8, backgroundColor: C.gold },
  loginTitle: { color: C.text, fontSize: 28, fontWeight: "900", marginTop: 4 },
  loginSubtitle: { color: C.muted, fontSize: 15, marginBottom: 6 },
  helper: { color: C.muted, textAlign: "center", fontSize: 12, lineHeight: 18 },
  bootText: { color: C.muted, fontWeight: "700" },
  input: { minHeight: 52, backgroundColor: C.surface2, color: C.text, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingHorizontal: 15, fontSize: 16 },
  errorText: { color: "#fda4af", fontSize: 13, lineHeight: 18 },
  topbar: { minHeight: 64, flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  brand: { color: C.gold, fontWeight: "900", fontSize: 13, letterSpacing: 0.5 },
  schoolName: { color: C.text, fontWeight: "800", fontSize: 18, marginTop: 3 },
  syncButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.surface2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
  syncButtonText: { color: C.text, fontSize: 22, fontWeight: "800" },
  message: { backgroundColor: "#421820", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#8b2937" },
  messageText: { color: "#fecdd3", fontSize: 13, lineHeight: 18 },
  content: { flex: 1 },
  contentInner: { padding: 18, paddingBottom: 110, gap: 12 },
  pageEyebrow: { color: C.gold, fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  pageTitle: { color: C.text, fontSize: 26, fontWeight: "900", marginTop: 3 },
  pageSubtitle: { color: C.muted, fontSize: 14, lineHeight: 20, marginBottom: 6 },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { width: "48%", flexGrow: 1, minHeight: 90, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 15, justifyContent: "space-between" },
  metricValue: { color: C.text, fontSize: 28, fontWeight: "900" },
  metricLabel: { color: C.muted, fontSize: 12, fontWeight: "700" },
  highlightCard: { backgroundColor: "#102b59", borderWidth: 1, borderColor: "#28569a", borderRadius: 22, padding: 18, gap: 10, marginTop: 4 },
  highlightKicker: { color: C.gold, fontWeight: "900", fontSize: 10, letterSpacing: 1.2 },
  highlightValue: { color: C.text, fontWeight: "900", fontSize: 32 },
  highlightText: { color: "#c8d6ee", fontSize: 13, lineHeight: 19 },
  sectionTitle: { color: C.text, fontWeight: "900", fontSize: 17, marginTop: 12, marginBottom: 2 },
  search: { minHeight: 48, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, color: C.text, paddingHorizontal: 14, marginVertical: 8 },
  listCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 14, marginTop: 8 },
  listCardColumn: { gap: 5, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 14, marginTop: 8 },
  invoiceCard: { gap: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 15, marginTop: 8 },
  accountCard: { gap: 7, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 16, marginTop: 8 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  listTitle: { color: C.text, fontSize: 15, fontWeight: "800", flexShrink: 1 },
  listMeta: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  listAmount: { color: C.text, fontSize: 14, fontWeight: "900" },
  statusText: { fontSize: 11, fontWeight: "900" },
  statusChip: { fontSize: 11, fontWeight: "900" },
  receipt: { color: C.gold, fontSize: 11, fontWeight: "800", marginTop: 2 },
  providerNote: { color: C.muted, fontSize: 12 },
  invoiceActions: { flexDirection: "row", gap: 8 },
  actionButton: { minHeight: 46, flex: 1, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, paddingVertical: 10, marginTop: 2 },
  actionButtonText: { fontSize: 13.5, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.9 },
  empty: { alignItems: "center", gap: 8, paddingVertical: 38, paddingHorizontal: 20 },
  emptyIcon: { color: C.muted, fontSize: 34 },
  emptyTitle: { color: C.text, fontWeight: "900", fontSize: 16, textAlign: "center" },
  emptyText: { color: C.muted, fontSize: 13, textAlign: "center", lineHeight: 19 },
  bottomNav: { position: "absolute", left: 0, right: 0, bottom: 0, height: 82, paddingBottom: 14, flexDirection: "row", backgroundColor: "#0a1529", borderTopWidth: 1, borderTopColor: C.border },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  navIcon: { color: C.muted, fontSize: 20, fontWeight: "900" },
  navLabel: { color: C.muted, fontSize: 10.5, fontWeight: "800" },
  navActive: { color: C.gold },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.65)", justifyContent: "flex-end" },
  modalBackdropCenter: { flex: 1, backgroundColor: "rgba(0,0,0,.72)", justifyContent: "center", padding: 20 },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: C.border, padding: 20, paddingBottom: 30, gap: 12 },
  sheetHandle: { alignSelf: "center", width: 52, height: 5, borderRadius: 5, backgroundColor: "#415270", marginBottom: 4 },
  sheetTitle: { color: C.text, fontSize: 22, fontWeight: "900" },
  sheetSubtitle: { color: C.muted, fontSize: 13, lineHeight: 19 },
  sheetInfo: { color: "#c9d4e8", backgroundColor: C.surface2, borderRadius: 14, padding: 13, lineHeight: 19, fontSize: 13 },
  chargeResult: { backgroundColor: C.surface2, borderRadius: 16, padding: 15, gap: 5 },
  chargeAmount: { color: C.text, fontSize: 28, fontWeight: "900" },
  pixCode: { color: "#cbd5e1", backgroundColor: "#07101f", borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, fontSize: 11, lineHeight: 16 },
  pickerCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 18, gap: 10, maxHeight: "75%" },
  schoolOption: { borderWidth: 1, borderColor: C.border, borderRadius: 15, padding: 14, gap: 3 },
});
