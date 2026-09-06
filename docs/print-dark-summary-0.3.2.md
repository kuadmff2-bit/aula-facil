# Correções de impressão e contraste — 0.3.2

## Impressão
- Interface normal removida do fluxo durante a impressão.
- Certificado impresso em palco isolado do tamanho exato do papel/orientação.
- Recibo A4 dividido em duas metades exatas, sem espaço entre as vias.
- Uma linha tracejada única marca o corte central.
- PDF do recibo usa a mesma divisão sem corredor vazio.

## Modo escuro
- Contraste reforçado em títulos, descrições, labels, inputs, tabelas, avisos, Cloud, pagamentos e automações.
- Cards e textos longos passam a respeitar os limites da caixa e quebrar linha.

## Regressão
- Teste automático verifica isolamento do app, divisão 50/50 do recibo e contenção do certificado em uma página.
