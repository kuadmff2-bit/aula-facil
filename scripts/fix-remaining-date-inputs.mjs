import fs from "node:fs";

function patch(path, from, to) {
  const source = fs.readFileSync(path, "utf8");
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${path}: esperado 1 trecho, encontrado ${count}`);
  fs.writeFileSync(path, source.replace(from, to));
}

patch(
  "src/debt-negotiation-panel.tsx",
  '<label><span>Primeiro vencimento</span><input type="date" value={firstDueDate} onChange={(event) => setFirstDueDate(event.target.value)} /></label>',
  '<label><span>Primeiro vencimento</span><input type="date" defaultValue={firstDueDate} onChange={(event) => { const next = event.currentTarget.value; if (next) setFirstDueDate(next); }} /></label>',
);

patch(
  "src/finance-ultimate.tsx",
  '<div className="monthly-generator"><label><span>Mês</span><input type="month" value={referenceMonth} onChange={(event) => setReferenceMonth(event.target.value)} /></label><button className="primary-button" onClick={generateMonthly}><Plus size={17}/> Gerar cursos contínuos</button></div>',
  '<div className="monthly-generator"><label><span>Mês</span><input type="month" defaultValue={referenceMonth} onChange={(event) => { const next = event.currentTarget.value; if (next) setReferenceMonth(next); }} /></label><button className="primary-button" onClick={generateMonthly}><Plus size={17}/> Gerar cursos contínuos</button></div>',
);

console.log("Campos de data restantes corrigidos.");
