const fs = require('fs');

const appPath = 'mobile/App.tsx';
let app = fs.readFileSync(appPath, 'utf8');

function replaceOnce(pattern, replacement, label) {
  const next = typeof pattern === 'string' ? app.replace(pattern, replacement) : app.replace(pattern, replacement);
  if (next === app) throw new Error(`Não foi possível aplicar: ${label}`);
  app = next;
}

replaceOnce(
  '  const [schoolPicker, setSchoolPicker] = useState(false);',
  '  const [schoolPicker, setSchoolPicker] = useState(false);\n  const [selectedStudent, setSelectedStudent] = useState<MobileStudent | null>(null);',
  'estado do aluno selecionado',
);

app = app.replaceAll('label="Pix / boleto"', 'label="Cobrar"');

replaceOnce(
  /\{visibleStudents\.length \? visibleStudents\.map\(\(student\) => \{[\s\S]*?\}\) : <Empty title="Nenhum aluno encontrado" text="Tente outro nome ou telefone\." \/>\}/,
  `{visibleStudents.length ? visibleStudents.map((student) => {\n              const className = classMap.get(studentClassMap.get(student.id) ?? "")?.name ?? "Sem turma";\n              return (\n                <Pressable\n                  key={student.id}\n                  accessibilityRole="button"\n                  accessibilityLabel={\`Abrir dados de ${'${student.name}'}\`}\n                  onPress={() => setSelectedStudent(student)}\n                  style={({ pressed }) => [styles.listCardColumn, styles.studentCard, pressed && styles.pressed]}\n                >\n                  <View style={styles.rowBetween}>\n                    <Text numberOfLines={2} style={styles.listTitle}>{student.name}</Text>\n                    <Text numberOfLines={1} style={[styles.statusChip, { color: student.enrollmentStatus === "active" ? C.success : C.warning }]}>\n                      {student.enrollmentStatus === "active" ? "Ativo" : "Pausado"}\n                    </Text>\n                  </View>\n                  <Text numberOfLines={2} style={styles.studentClassName}>{className}</Text>\n                  <Text numberOfLines={1} style={styles.listMeta}>{phoneLabel(student.phone)}</Text>\n                  {student.guardianName ? <Text numberOfLines={2} style={styles.listMeta}>Responsável: {student.guardianName}{student.guardianPhone ? \` • ${'${phoneLabel(student.guardianPhone)}'}\` : ""}</Text> : null}\n                  <Text style={styles.openHint}>Toque para abrir os dados</Text>\n                </Pressable>\n              );\n            }) : <Empty title="Nenhum aluno encontrado" text="Tente outro nome ou telefone." />}`,
  'cards de alunos clicáveis',
);

const studentModal = `\n      <Modal transparent visible={Boolean(selectedStudent)} animationType="slide" onRequestClose={() => setSelectedStudent(null)}>\n        <View style={styles.modalBackdrop}>\n          <View style={styles.sheet}>\n            {selectedStudent ? (() => {\n              const className = classMap.get(studentClassMap.get(selectedStudent.id) ?? "")?.name ?? "Sem turma";\n              const openInvoices = invoices.filter((item) => item.studentId === selectedStudent.id && ["pending", "overdue"].includes(effectiveStatus(item))).length;\n              return (\n                <>\n                  <View style={styles.sheetHandle} />\n                  <Text style={styles.sheetTitle}>{selectedStudent.name}</Text>\n                  <Text style={styles.sheetSubtitle}>{className}</Text>\n                  <View style={styles.studentDetailBox}>\n                    <Text style={styles.detailLabel}>Telefone</Text>\n                    <Text style={styles.detailValue}>{phoneLabel(selectedStudent.phone)}</Text>\n                    <Text style={styles.detailLabel}>Responsável</Text>\n                    <Text style={styles.detailValue}>{selectedStudent.guardianName || "Não informado"}</Text>\n                    <Text style={styles.detailLabel}>Contato do responsável</Text>\n                    <Text style={styles.detailValue}>{selectedStudent.guardianPhone ? phoneLabel(selectedStudent.guardianPhone) : "Não informado"}</Text>\n                    <Text style={styles.detailLabel}>Situação</Text>\n                    <Text style={styles.detailValue}>{selectedStudent.enrollmentStatus === "active" ? "Ativo" : "Pausado"}</Text>\n                    <Text style={styles.detailLabel}>Mensalidades em aberto</Text>\n                    <Text style={styles.detailValue}>{openInvoices}</Text>\n                  </View>\n                  <ActionButton label="Ver financeiro deste aluno" onPress={() => { setSelectedStudent(null); setTab("finance"); setQuery(selectedStudent.name); }} tone="gold" />\n                  <ActionButton label="Fechar" onPress={() => setSelectedStudent(null)} tone="ghost" />\n                </>\n              );\n            })() : null}\n          </View>\n        </View>\n      </Modal>\n`;

replaceOnce(
  '      <Modal transparent visible={Boolean(charge)} animationType="slide" onRequestClose={() => setCharge(null)}>',
  studentModal + '\n      <Modal transparent visible={Boolean(charge)} animationType="slide" onRequestClose={() => setCharge(null)}>',
  'modal de detalhes do aluno',
);

app = app.replace(/contentInner:\s*\{\s*padding:\s*18,\s*paddingBottom:\s*\d+,\s*gap:\s*12\s*\}/, 'contentInner: { padding: 18, paddingBottom: 150, gap: 12 }');
app = app.replace(/bottomNav:\s*\{\s*position:\s*"absolute",\s*left:\s*0,\s*right:\s*0,\s*bottom:\s*0,\s*height:\s*\d+,\s*paddingBottom:\s*\d+,/, 'bottomNav: { position: "absolute", left: 0, right: 0, bottom: 26, height: 72, paddingBottom: 0,');
app = app.replace(/statusText:\s*\{\s*fontSize:\s*11,\s*fontWeight:\s*"900"\s*\}/, 'statusText: { fontSize: 10, lineHeight: 14, fontWeight: "900", flexShrink: 0 }');
app = app.replace(/listAmount:\s*\{\s*color:\s*C\.text,\s*fontSize:\s*14,\s*fontWeight:\s*"900"\s*\}/, 'listAmount: { color: C.text, fontSize: 13, fontWeight: "900", flexShrink: 0 }');

const styleAnchor = '  listCardColumn: { gap: 5, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 14, marginTop: 8 },';
if (!app.includes('studentDetailBox:')) {
  if (!app.includes(styleAnchor)) throw new Error('Âncora de estilos de aluno não encontrada.');
  app = app.replace(styleAnchor, `${styleAnchor}\n  studentCard: { minHeight: 118 },\n  studentClassName: { color: "#d7e2f3", fontSize: 13.5, fontWeight: "800", lineHeight: 19 },\n  openHint: { color: C.gold, fontSize: 11, fontWeight: "800", marginTop: 3 },\n  studentDetailBox: { gap: 4, backgroundColor: C.surface2, borderRadius: 16, padding: 15, marginVertical: 4 },\n  detailLabel: { color: C.muted, fontSize: 10.5, fontWeight: "800", textTransform: "uppercase", marginTop: 5 },\n  detailValue: { color: C.text, fontSize: 14, fontWeight: "700", lineHeight: 20 },`);
}

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

console.log('AulaFácil Mobile 0.2.1 preparado: cards clicáveis, textos ajustados e menu elevado.');
