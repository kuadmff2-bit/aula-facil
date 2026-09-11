import { StatusBar } from "expo-status-bar";
import * as Clipboard from "expo-clipboard";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
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
import {
  loadClasses,
  loadSchoolBrand,
  loadStudentClassLinks,
  type MobileClass,
  type StudentClassLink,
} from "./src/school-extras";

type Tab = "home" | "students" | "classes" | "finance" | "more";
type ChargeState = { invoice: MobileInvoice; studentName: string; result?: ChargeResult } | null;

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

function timeLabel(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function phoneLabel(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value || "Sem telefone";
}

function paymentMethodLabel(value: string) {
  const method = value.toLowerCase();
  if (method === "pix") return "Pix";
  if (method === "boleto") return "Boleto";
  if (method === "dinheiro" || method === "cash") return "Dinheiro";
  if (method === "cartao" || method === "card") return "Cartão";
  return value || "Pagamento";
}

function effectiveStatus(invoice: MobileInvoice) {
  if (["paid", "cancelled", "negotiated"].includes(invoice.status)) return invoice.status;
  return invoice.dueDate < new Date().toISOString().slice(0, 10) ? "overdue" : "pending";
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

function ActionButton({ label, onPress, tone = "primary", disabled = false }: {
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
  const [classes, setClasses] = useState<MobileClass[]>([]);
  const [studentClassLinks, setStudentClassLinks] = useState<StudentClassLink[]>([]);
  const [schoolLogoUrl, setSchoolLogoUrl] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState("");

  const [tab, setTab] = useState<Tab>("home");
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [charge, setCharge] = useState<ChargeState>(null);
  const [schoolPicker, setSchoolPicker] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<MobileStudent | null>(null);

  const studentMap = useMemo(() => new Map(students.map((item) => [item.id, item])), [students]);
  const classMap = useMemo(() => new Map(classes.map((item) => [item.id, item])), [classes]);
  const studentClassMap = useMemo(() => new Map(studentClassLinks.map((item) => [item.studentId, item.classId])), [studentClassLinks]);
  const classStudentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const link of studentClassLinks) counts.set(link.classId, (counts.get(link.classId) ?? 0) + 1);
    return counts;
  }, [studentClassLinks]);

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
    return students.filter((item) => {
      const className = classMap.get(studentClassMap.get(item.id) ?? "")?.name ?? "";
      return `${item.name} ${item.phone} ${item.guardianName} ${item.guardianPhone} ${className}`.toLocaleLowerCase("pt-BR").includes(q);
    });
  }, [students, query, classMap, studentClassMap]);

  const visibleClasses = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    if (!q) return classes;
    return classes.filter((item) => `${item.name} ${item.groupName} ${item.teacher} ${item.schedule} ${item.room}`.toLocaleLowerCase("pt-BR").includes(q));
  }, [classes, query]);

  const visibleInvoices = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    return invoices
      .filter((item) => {
        if (!q) return true;
        const student = studentMap.get(item.studentId);
        return `${student?.name ?? ""} ${item.reference} ${statusLabel(effectiveStatus(item))}`.toLocaleLowerCase("pt-BR").includes(q);
      })
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  }, [invoices, query, studentMap]);

  const loadSchoolData = async (selected: MobileSchool, silent = false) => {
    if (!silent) setLoadingData(true);
    try {
      const [nextStudents, nextInvoices, nextPayments, nextClasses, nextLinks, nextBrand] = await Promise.all([
        loadStudents(selected.id),
        loadInvoices(selected.id),
        loadPayments(selected.id),
        loadClasses(selected.id),
        loadStudentClassLinks(selected.id),
        loadSchoolBrand(selected.id),
      ]);
      setStudents(nextStudents);
      setInvoices(nextInvoices);
      setPayments(nextPayments);
      setClasses(nextClasses);
      setStudentClassLinks(nextLinks);
      setSchoolLogoUrl(nextBrand.logoUrl);
      setLastSyncAt(new Date().toISOString());
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
        try {
          await loadAccount();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Falha ao carregar a conta.");
        }
      }
      if (mounted) setBooting(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setAuthenticated(Boolean(session));
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

  useEffect(() => {
    if (!authenticated || !school) return;
    const interval = setInterval(() => void loadSchoolData(school, true), 30_000);
    return () => clearInterval(interval);
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
      await loadSchoolData(school!, true);
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
              Alert.alert("Pagamento confirmado", "A mensalidade foi baixada e o recibo foi registrado.");
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
    setClasses([]);
    setStudentClassLinks([]);
    setSchoolLogoUrl("");
    setLastSyncAt("");
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
        <View style={styles.schoolHeader}>
          {schoolLogoUrl ? (
            <Image source={{ uri: schoolLogoUrl }} style={styles.schoolLogo} resizeMode="cover" />
          ) : (
            <View style={styles.schoolLogoFallback}><Text style={styles.schoolLogoFallbackText}>{school.name.slice(0, 1).toUpperCase()}</Text></View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.brand}>AulaFácil</Text>
            <Pressable onPress={() => schools.length > 1 && setSchoolPicker(true)}>
              <Text numberOfLines={1} style={styles.schoolName}>{school.name}{schools.length > 1 ? "  ▾" : ""}</Text>
            </Pressable>
          </View>
        </View>
        <Pressable style={styles.syncButton} onPress={() => void refresh()} disabled={refreshing}>
          <Text style={styles.syncButtonText}>{refreshing ? "…" : "↻"}</Text>
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
            <Text style={styles.pageSubtitle}>Dados atualizados automaticamente. Última atualização: {timeLabel(lastSyncAt)}.</Text>

            <View style={styles.metricsGrid}>
              <View style={styles.metric}><Text style={styles.metricValue}>{students.length}</Text><Text style={styles.metricLabel}>Alunos</Text></View>
              <View style={styles.metric}><Text style={styles.metricValue}>{classes.length}</Text><Text style={styles.metricLabel}>Turmas</Text></View>
              <View style={[styles.metric, metrics.overdue > 0 && { borderColor: C.danger }]}><Text style={[styles.metricValue, metrics.overdue > 0 && { color: C.danger }]}>{metrics.overdue}</Text><Text style={styles.metricLabel}>Atrasadas</Text></View>
              <View style={styles.metric}><Text style={[styles.metricValue, { fontSize: 18 }]}>{money(metrics.receivedMonth)}</Text><Text style={styles.metricLabel}>Recebido no mês</Text></View>
            </View>

            <View style={styles.highlightCard}>
              <Text style={styles.highlightKicker}>VALOR EM ABERTO</Text>
              <Text style={styles.highlightValue}>{money(metrics.openValue)}</Text>
              <Text style={styles.highlightText}>{metrics.pending} mensalidades abertas. Toque abaixo para cobrar ou receber.</Text>
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
            <TextInput placeholder="Buscar aluno, responsável ou turma" placeholderTextColor={C.muted} value={query} onChangeText={setQuery} style={styles.search} />
            {visibleStudents.length ? visibleStudents.map((student) => {
              const classItem = classMap.get(studentClassMap.get(student.id) ?? "");
              const className = classItem ? `${classItem.name}${classItem.groupName ? ` • ${classItem.groupName}` : ""}` : "Sem turma vinculada";
              return (
                <Pressable
                  key={student.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Abrir dados de ${student.name}`}
                  onPress={() => setSelectedStudent(student)}
                  style={({ pressed }) => [styles.listCardColumn, styles.studentCard, pressed && styles.pressed]}
                >
                  <View style={styles.rowBetween}>
                    <Text numberOfLines={2} style={styles.listTitle}>{student.name}</Text>
                    <Text numberOfLines={1} style={[styles.statusChip, { color: student.enrollmentStatus === "active" ? C.success : C.warning }]}>
                      {student.enrollmentStatus === "active" ? "Ativo" : "Pausado"}
                    </Text>
                  </View>
                  <Text numberOfLines={2} style={styles.studentClassName}>{className}</Text>
                  <Text numberOfLines={1} style={styles.listMeta}>{phoneLabel(student.phone)}</Text>
                  {student.guardianName ? <Text numberOfLines={2} style={styles.listMeta}>Responsável: {student.guardianName}{student.guardianPhone ? ` • ${phoneLabel(student.guardianPhone)}` : ""}</Text> : null}
                  <Text style={styles.openHint}>Toque para abrir os dados</Text>
                </Pressable>
              );
            }) : <Empty title="Nenhum aluno encontrado" text="Tente outro nome, telefone ou turma." />}
          </>
        ) : null}

        {!loadingData && tab === "classes" ? (
          <>
            <Text style={styles.pageEyebrow}>TURMAS</Text>
            <Text style={styles.pageTitle}>{classes.length} turmas</Text>
            <Text style={styles.pageSubtitle}>Cursos, horários, professores e alunos em um só lugar.</Text>
            <TextInput placeholder="Buscar turma ou professor" placeholderTextColor={C.muted} value={query} onChangeText={setQuery} style={styles.search} />
            {visibleClasses.length ? visibleClasses.map((item) => (
              <View key={item.id} style={styles.classCard}>
                <View style={[styles.classStripe, { backgroundColor: item.color || C.primary }]} />
                <View style={{ flex: 1, gap: 5 }}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.listTitle}>{item.name}{item.groupName ? ` • ${item.groupName}` : ""}</Text>
                    <Text style={styles.statusChip}>{classStudentCounts.get(item.id) ?? 0} alunos</Text>
                  </View>
                  <Text style={styles.listMeta}>{item.teacher ? `Professor(a): ${item.teacher}` : "Professor não informado"}</Text>
                  <Text style={styles.listMeta}>{[item.schedule, item.room].filter(Boolean).join(" • ") || "Horário não informado"}</Text>
                  <Text style={styles.classFee}>{money(item.monthlyFee)} / mês</Text>
                </View>
              </View>
            )) : <Empty title="Nenhuma turma encontrada" text="As turmas cadastradas no desktop aparecem aqui automaticamente." />}
          </>
        ) : null}

        {!loadingData && tab === "finance" ? (
          <>
            <Text style={styles.pageEyebrow}>FINANCEIRO</Text>
            <Text style={styles.pageTitle}>Mensalidades</Text>
            <Text style={styles.pageSubtitle}>Cobrar, receber e conferir sem sair da tela.</Text>
            <TextInput placeholder="Buscar aluno ou referência" placeholderTextColor={C.muted} value={query} onChangeText={setQuery} style={styles.search} />
            {visibleInvoices.length ? visibleInvoices.map((invoice) => {
              const student = studentMap.get(invoice.studentId);
              const status = effectiveStatus(invoice);
              const open = status === "pending" || status === "overdue";
              return (
                <View key={invoice.id} style={styles.invoiceCard}>
                  <View style={styles.rowBetween}>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={styles.listTitle}>{student?.name ?? "Aluno"}</Text>
                      <Text style={styles.listMeta}>{invoice.reference} • vencimento {dateLabel(invoice.dueDate)}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.listAmount}>{money(invoice.amount)}</Text>
                      <Text style={[styles.statusText, { color: statusColor(status) }]}>{statusLabel(status)}</Text>
                    </View>
                  </View>
                  {open ? (
                    <View style={styles.invoiceActions}>
                      <ActionButton label="Cobrar" onPress={() => startCharge(invoice)} tone="gold" disabled={actionBusy} />
                      <ActionButton label="Receber" onPress={() => receiveCash(invoice)} tone="ghost" disabled={actionBusy} />
                    </View>
                  ) : invoice.providerChargeId ? <Text style={styles.providerNote}>Cobrança {invoice.provider || "bancária"} vinculada.</Text> : null}
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
              <View style={styles.accountHeader}>
                {schoolLogoUrl ? <Image source={{ uri: schoolLogoUrl }} style={styles.accountLogo} resizeMode="cover" /> : null}
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTitle}>{school.name}</Text>
                  <Text style={styles.listMeta}>Acesso: {school.role || "usuário"}</Text>
                </View>
              </View>
              <Text style={styles.syncOk}>● Sincronização automática ativa</Text>
              <Text style={styles.listMeta}>Última atualização: {timeLabel(lastSyncAt)}. O app também atualiza ao abrir e ao voltar para a tela.</Text>
            </View>

            <Text style={styles.sectionTitle}>Recebimentos recentes</Text>
            {payments.slice(0, 12).map((payment) => {
              const student = studentMap.get(payment.studentId);
              return (
                <View key={payment.id} style={styles.listCard}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={styles.listTitle}>{student?.name ?? "Aluno"}</Text>
                    <Text style={styles.listMeta}>{dateLabel(payment.paidAt)} • {paymentMethodLabel(payment.method)}</Text>
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
            <Text style={styles.version}>AulaFácil Mobile 0.2.1</Text>
          </>
        ) : null}
      </ScrollView>

      <View style={styles.bottomNav}>
        {([
          ["home", "⌂", "Início"],
          ["students", "♙", "Alunos"],
          ["classes", "▦", "Turmas"],
          ["finance", "$", "Financeiro"],
          ["more", "•••", "Mais"],
        ] as const).map(([key, icon, label]) => (
          <Pressable key={key} style={styles.navItem} onPress={() => { setTab(key); setQuery(""); }}>
            <Text style={[styles.navIcon, tab === key && styles.navActive]}>{icon}</Text>
            <Text style={[styles.navLabel, tab === key && styles.navActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <Modal transparent visible={Boolean(selectedStudent)} animationType="slide" onRequestClose={() => setSelectedStudent(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            {selectedStudent ? (() => {
              const classItem = classMap.get(studentClassMap.get(selectedStudent.id) ?? "");
              const className = classItem ? `${classItem.name}${classItem.groupName ? ` • ${classItem.groupName}` : ""}` : "Sem turma vinculada";
              const openInvoices = invoices.filter((item) => item.studentId === selectedStudent.id && ["pending", "overdue"].includes(effectiveStatus(item))).length;
              return (
                <>
                  <View style={styles.sheetHandle} />
                  <Text style={styles.sheetTitle}>{selectedStudent.name}</Text>
                  <Text style={styles.sheetSubtitle}>{className}</Text>
                  <View style={styles.studentDetailBox}>
                    <Text style={styles.detailLabel}>Telefone</Text>
                    <Text style={styles.detailValue}>{phoneLabel(selectedStudent.phone)}</Text>
                    <Text style={styles.detailLabel}>Responsável</Text>
                    <Text style={styles.detailValue}>{selectedStudent.guardianName || "Não informado"}</Text>
                    <Text style={styles.detailLabel}>Contato do responsável</Text>
                    <Text style={styles.detailValue}>{selectedStudent.guardianPhone ? phoneLabel(selectedStudent.guardianPhone) : "Não informado"}</Text>
                    <Text style={styles.detailLabel}>Situação</Text>
                    <Text style={styles.detailValue}>{selectedStudent.enrollmentStatus === "active" ? "Ativo" : "Pausado"}</Text>
                    <Text style={styles.detailLabel}>Mensalidades em aberto</Text>
                    <Text style={styles.detailValue}>{openInvoices}</Text>
                  </View>
                  <ActionButton label="Ver financeiro deste aluno" onPress={() => { const name = selectedStudent.name; setSelectedStudent(null); setTab("finance"); setQuery(name); }} tone="gold" />
                  <ActionButton label="Fechar" onPress={() => setSelectedStudent(null)} tone="ghost" />
                </>
              );
            })() : null}
          </View>
        </View>
      </Modal>

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
                    <Text style={styles.sheetInfo}>Os dados do pagador vêm automaticamente da matrícula. Você não precisa preencher tudo de novo.</Text>
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
  topbar: { minHeight: 70, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.border, gap: 10 },
  schoolHeader: { flex: 1, flexDirection: "row", alignItems: "center", gap: 11 },
  schoolLogo: { width: 44, height: 44, borderRadius: 13, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border },
  schoolLogoFallback: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#0d2d73", borderWidth: 1, borderColor: "#28569a" },
  schoolLogoFallbackText: { color: C.text, fontSize: 20, fontWeight: "900" },
  brand: { color: C.gold, fontWeight: "900", fontSize: 12, letterSpacing: 0.6 },
  schoolName: { color: C.text, fontWeight: "800", fontSize: 17, marginTop: 2 },
  syncButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.surface2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
  syncButtonText: { color: C.text, fontSize: 22, fontWeight: "800" },
  message: { backgroundColor: "#421820", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#8b2937" },
  messageText: { color: "#fecdd3", fontSize: 13, lineHeight: 18 },
  content: { flex: 1 },
  contentInner: { padding: 18, paddingBottom: 180, gap: 12 },
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
  studentCard: { minHeight: 118 },
  studentClassName: { color: "#d7e2f3", fontSize: 13.5, fontWeight: "800", lineHeight: 19 },
  openHint: { color: C.gold, fontSize: 11, fontWeight: "800", marginTop: 3 },
  studentDetailBox: { gap: 4, backgroundColor: C.surface2, borderRadius: 16, padding: 15, marginVertical: 4 },
  detailLabel: { color: C.muted, fontSize: 10.5, fontWeight: "800", textTransform: "uppercase", marginTop: 5 },
  detailValue: { color: C.text, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  invoiceCard: { gap: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 15, marginTop: 8 },
  classCard: { flexDirection: "row", gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 14, marginTop: 8, overflow: "hidden" },
  classStripe: { width: 5, borderRadius: 6, alignSelf: "stretch" },
  classFee: { color: C.gold, fontSize: 12, fontWeight: "900", marginTop: 2 },
  className: { color: "#c8d6ee", fontSize: 12.5, fontWeight: "700" },
  accountCard: { gap: 9, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 16, marginTop: 8 },
  accountHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  accountLogo: { width: 52, height: 52, borderRadius: 15, backgroundColor: C.surface2 },
  syncOk: { color: C.success, fontSize: 12, fontWeight: "900", marginTop: 4 },
  version: { color: C.muted, fontSize: 11, textAlign: "center", marginTop: 10 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  listTitle: { color: C.text, fontSize: 15, fontWeight: "800", flexShrink: 1 },
  listMeta: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  listAmount: { color: C.text, fontSize: 13, fontWeight: "900", flexShrink: 0 },
  statusText: { fontSize: 10, lineHeight: 14, fontWeight: "900", flexShrink: 0 },
  statusChip: { color: C.muted, fontSize: 11, fontWeight: "900" },
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
  bottomNav: { position: "absolute", left: 0, right: 0, bottom: 50, height: 72, paddingBottom: 0, flexDirection: "row", backgroundColor: "#0a1529", borderTopWidth: 1, borderTopColor: C.border },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  navIcon: { color: C.muted, fontSize: 19, fontWeight: "900" },
  navLabel: { color: C.muted, fontSize: 9.5, fontWeight: "800" },
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
