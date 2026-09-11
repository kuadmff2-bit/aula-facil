const fs = require('fs');

const appPath = 'mobile/App.tsx';
let app = fs.readFileSync(appPath, 'utf8');

function replaceOnce(pattern, replacement, label) {
  const next = app.replace(pattern, replacement);
  if (next === app) throw new Error(`Não foi possível aplicar: ${label}`);
  app = next;
}

function replaceBetween(startMarker, endMarker, replacement, label) {
  const start = app.indexOf(startMarker);
  const end = app.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) throw new Error(`Não foi possível localizar: ${label}`);
  app = app.slice(0, start) + replacement + '\n\n' + app.slice(end);
}

replaceOnce(
  '  const [schoolPicker, setSchoolPicker] = useState(false);',
  '  const [schoolPicker, setSchoolPicker] = useState(false);\n  const [selectedStudent, setSelectedStudent] = useState<MobileStudent | null>(null);',
  'estado do aluno selecionado',
);

app = app.replaceAll('label="Pix / boleto"', 'label="Cobrar"');
app = app.replaceAll('AulaFácil Mobile 0.2.0', 'AulaFácil Mobile 0.2.1');

const studentsSection = `        {!loadingData && tab === "students" ? (\n          <>\n            <Text style={styles.pageEyebrow}>ALUNOS</Text>\n            <Text style={styles.pageTitle}>{students.length} cadastrados</Text>\n            <TextInput placeholder="Buscar aluno, responsável ou turma" placeholderTextColor={C.muted} value={query} onChangeText={setQuery} style={styles.search} />\n            {visibleStudents.length ? visibleStudents.map((student) => {\n              const classItem = classMap.get(studentClassMap.get(student.id) ?? "");\n              const className = classItem ? \`${'${classItem.name}'}${'${classItem.groupName ? ` • ${classItem.groupName}` : ""}'}\` : "Sem turma vinculada";\n              return (\n                <Pressable\n                  key={student.id}\n                  accessibilityRole="button"\n                  accessibilityLabel={\`Abrir dados de ${'${student.name}'}\`}\n                  onPress={() => setSelectedStudent(student)}\n                  style={({ pressed }) => [styles.listCardColumn, styles.studentCard, pressed && styles.pressed]}\n                >\n                  <View style={styles.rowBetween}>\n                    <Text numberOfLines={2} style={styles.listTitle}>{student.name}</Text>\n                    <Text numberOfLines={1} style={[styles.statusChip, { color: student.enrollmentStatus === "active" ? C.success : C.warning }]}>\n                      {student.enrollmentStatus === "active" ? "Ativo" : "Pausado"}\n                    </Text>\n                  </View>\n                  <Text numberOfLines={2} style={styles.studentClassName}>{className}</Text>\n                  <Text numberOfLines={1} style={styles.listMeta}>{phoneLabel(student.phone)}</Text>\n                  {student.guardianName ? <Text numberOfLines={2} style={styles.listMeta}>Responsável: {student.guardianName}{student.guardianPhone ? \` • ${'${phoneLabel(student.guardianPhone)}'}\` : ""}</Text> : null}\n                  <Text style={styles.openHint}>Toque para abrir os dados</Text>\n                </Pressable>\n              );\n            }) : <Empty title="Nenhum aluno encontrado" text="Tente outro nome, telefone ou turma." />}\n          </>\n        ) : null}`;

replaceBetween(
  '        {!loadingData && tab === "students" ? (',
  '        {!loadingData && tab === "classes" ? (',
  studentsSection,
  'seção de alunos',
);

const studentModal = `      <Modal transparent visible={Boolean(selectedStudent)} animationType="slide" onRequestClose={() => setSelectedStudent(null)}>\n        <View style={styles.modalBackdrop}>\n          <View style={styles.sheet}>\n            {selectedStudent ? (() => {\n              const classItem = classMap.get(studentClassMap.get(selectedStudent.id) ?? "");\n              const className = classItem ? \`${'${classItem.name}'}${'${classItem.groupName ? ` • ${classItem.groupName}` : ""}'}\` : "Sem turma vinculada";\n              const openInvoices = invoices.filter((item) => item.studentId === selectedStudent.id && ["pending", "overdue"].includes(effectiveStatus(item))).length;\n              return (\n                <>\n                  <View style={styles.sheetHandle} />\n                  <Text style={styles.sheetTitle}>{selectedStudent.name}</Text>\n                  <Text style={styles.sheetSubtitle}>{className}</Text>\n                  <View style={styles.studentDetailBox}>\n                    <Text style={styles.detailLabel}>Telefone</Text>\n                    <Text style={styles.detailValue}>{phoneLabel(selectedStudent.phone)}</Text>\n                    <Text style={styles.detailLabel}>Responsável</Text>\n                    <Text style={styles.detailValue}>{selectedStudent.guardianName || "Não informado"}</Text>\n                    <Text style={styles.detailLabel}>Contato do responsável</Text>\n                    <Text style={styles.detailValue}>{selectedStudent.guardianPhone ? phoneLabel(selectedStudent.guardianPhone) : "Não informado"}</Text>\n                    <Text style={styles.detailLabel}>Situação</Text>\n                    <Text style={styles.detailValue}>{selectedStudent.enrollmentStatus === "active" ? "Ativo" : "Pausado"}</Text>\n                    <Text style={styles.detailLabel}>Mensalidades em aberto</Text>\n                    <Text style={styles.detailValue}>{openInvoices}</Text>\n                  </View>\n                  <ActionButton label="Ver financeiro deste aluno" onPress={() => { const name = selectedStudent.name; setSelectedStudent(null); setTab("finance"); setQuery(name); }} tone="gold" />\n                  <ActionButton label="Fechar" onPress={() => setSelectedStudent(null)} tone="ghost" />\n                </>\n              );\n            })() : null}\n          </View>\n        </View>\n      </Modal>`;

replaceOnce(
  '      <Modal transparent visible={Boolean(charge)} animationType="slide" onRequestClose={() => setCharge(null)}>',
  studentModal + '\n\n      <Modal transparent visible={Boolean(charge)} animationType="slide" onRequestClose={() => setCharge(null)}>',
  'modal de detalhes do aluno',
);

replaceOnce('contentInner: { padding: 18, paddingBottom: 110, gap: 12 }', 'contentInner: { padding: 18, paddingBottom: 150, gap: 12 }', 'espaço inferior do conteúdo');
replaceOnce('bottomNav: { position: "absolute", left: 0, right: 0, bottom: 0, height: 82, paddingBottom: 14,', 'bottomNav: { position: "absolute", left: 0, right: 0, bottom: 28, height: 72, paddingBottom: 0,', 'posição do menu inferior');
replaceOnce('listAmount: { color: C.text, fontSize: 14, fontWeight: "900" }', 'listAmount: { color: C.text, fontSize: 13, fontWeight: "900", flexShrink: 0 }', 'valor financeiro compacto');
replaceOnce('statusText: { fontSize: 11, fontWeight: "900" }', 'statusText: { fontSize: 10, lineHeight: 14, fontWeight: "900", flexShrink: 0 }', 'status financeiro compacto');

const styleAnchor = '  listCardColumn: { gap: 5, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 14, marginTop: 8 },';
if (!app.includes(styleAnchor)) throw new Error('Âncora de estilos de aluno não encontrada.');
app = app.replace(styleAnchor, `${styleAnchor}\n  studentCard: { minHeight: 118 },\n  studentClassName: { color: "#d7e2f3", fontSize: 13.5, fontWeight: "800", lineHeight: 19 },\n  openHint: { color: C.gold, fontSize: 11, fontWeight: "800", marginTop: 3 },\n  studentDetailBox: { gap: 4, backgroundColor: C.surface2, borderRadius: 16, padding: 15, marginVertical: 4 },\n  detailLabel: { color: C.muted, fontSize: 10.5, fontWeight: "800", textTransform: "uppercase", marginTop: 5 },\n  detailValue: { color: C.text, fontSize: 14, fontWeight: "700", lineHeight: 20 },`);

fs.writeFileSync(appPath, app);

const pkgPath = 'mobile/package.json';
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = '0.2.1';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const appJsonPath = 'mobile/app.json';
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
appJson.expo.version = '0.2.1';
appJson.expo.android.versionCode = 4;
fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');

const workflowPath = '.github/workflows/build-mobile-android.yml';
let workflow = fs.readFileSync(workflowPath, 'utf8');
workflow = workflow.replaceAll('0.2.0', '0.2.1');
fs.writeFileSync(workflowPath, workflow);

console.log('AulaFácil Mobile 0.2.1 preparado: menu elevado, alunos clicáveis e textos corrigidos.');
