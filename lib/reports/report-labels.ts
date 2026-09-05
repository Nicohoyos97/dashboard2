// Wording for the client-facing PDF reports (KILL-PDF.md).
//
// It lives here rather than in `messages/` for the same reason the CSV headers
// do: the export route sits under /api and is not localized, so it picks its
// language from the request and reads it from a plain table. The English text
// is the standard's own wording; keep the two in step.

export type ReportLabels = {
  profitAndLoss: string;
  balanceSheet: string;
  tagline: string;
  attn: string;
  re: string;
  salutation: string;
  intro: string;
  basisCash: string;
  basisAccrual: string;
  basisCashExplained: string;
  basisAccrualExplained: string;
  kpiIncome: string;
  kpiGrossProfit: string;
  kpiExpenses: string;
  kpiNetIncome: string;
  kpiAssets: string;
  kpiLiabilities: string;
  kpiEquity: string;
  kpiWorkingCapital: string;
  analysisIncome: string;
  analysisIncomeNoCogs: string;
  analysisMargin: string;
  analysisExpenses: string;
  analysisExpensesLed: string;
  analysisNetIncome: string;
  analysisNetLoss: string;
  analysisAssets: string;
  analysisWorkingCapital: string;
  closing: string;
  sincerely: string;
  totalColumn: string;
  continued: string;
  continuedSection: string;
  footerLeft: string;
  footerRight: string;
  noComparative: string;
};

const EN: ReportLabels = {
  profitAndLoss: 'Profit and Loss',
  balanceSheet: 'Balance Sheet',
  tagline: 'Bookkeeping & Accounting',
  attn: 'Attn: Management',
  re: 'RE: {title} — {period} ({basis})',
  salutation: 'Dear Management,',
  intro:
    'Please find enclosed the {title} for {company} covering {period}. The statement has been prepared on {basisExplained}',
  basisCash: 'Cash Basis',
  basisAccrual: 'Accrual Basis',
  basisCashExplained:
    'a cash basis of accounting, meaning income is recognized when payment is received and expenses are recognized when they are paid.',
  basisAccrualExplained:
    'an accrual basis of accounting, meaning income is recognized when it is earned and expenses are recognized when they are incurred.',
  kpiIncome: 'Total Income',
  kpiGrossProfit: 'Gross Profit',
  kpiExpenses: 'Total Expenses',
  kpiNetIncome: 'Net Income',
  kpiAssets: 'Total Assets',
  kpiLiabilities: 'Total Liabilities',
  kpiEquity: 'Total Equity',
  kpiWorkingCapital: 'Working Capital',
  analysisIncome:
    'The company recorded total income of {revenue} and cost of goods sold of {cogs}, resulting in a gross profit of {grossProfit}{margin}.',
  analysisIncomeNoCogs: 'The company recorded total income of {revenue}.',
  analysisMargin: ' ({margin} margin)',
  analysisExpenses: 'Operating expenses totaled {expenses}.',
  analysisExpensesLed: 'Operating expenses totaled {expenses} — led by {items}.',
  analysisNetIncome: 'The period closed with a net income of {netIncome}.',
  analysisNetLoss: 'The period closed with a net loss of {netIncome}.',
  analysisAssets:
    'Total assets stood at {assets}, against total liabilities of {liabilities} and equity of {equity}.',
  analysisWorkingCapital:
    'Working capital was {workingCapital}, a current ratio of {currentRatio}.',
  closing:
    'The complete statement is presented on the following pages. Should you have any questions regarding these figures, please do not hesitate to contact our office.',
  sincerely: 'Sincerely,',
  totalColumn: 'TOTAL ({currency})',
  continued: 'continued',
  continuedSection: '{section} (CONTINUED)',
  footerLeft: 'Prepared by {firm} · {signer}, {role}',
  footerRight: '{basis} · All amounts in {currency}',
  noComparative: 'This statement carries no comparative column.',
};

const ES: ReportLabels = {
  profitAndLoss: 'Estado de Resultados',
  balanceSheet: 'Balance General',
  tagline: 'Contabilidad y Teneduría de Libros',
  attn: 'Atn: Gerencia',
  re: 'REF: {title} — {period} ({basis})',
  salutation: 'Estimada Gerencia:',
  intro:
    'Adjunto encontrará el {title} de {company} correspondiente a {period}. El estado se preparó sobre {basisExplained}',
  basisCash: 'Base de Caja',
  basisAccrual: 'Base Devengada',
  basisCashExplained:
    'una base de caja, es decir, los ingresos se reconocen cuando se recibe el pago y los gastos cuando se pagan.',
  basisAccrualExplained:
    'una base devengada, es decir, los ingresos se reconocen cuando se generan y los gastos cuando se incurren.',
  kpiIncome: 'Ingresos Totales',
  kpiGrossProfit: 'Utilidad Bruta',
  kpiExpenses: 'Gastos Totales',
  kpiNetIncome: 'Utilidad Neta',
  kpiAssets: 'Activos Totales',
  kpiLiabilities: 'Pasivos Totales',
  kpiEquity: 'Patrimonio Total',
  kpiWorkingCapital: 'Capital de Trabajo',
  analysisIncome:
    'La empresa registró ingresos totales de {revenue} y costo de ventas de {cogs}, resultando en una utilidad bruta de {grossProfit}{margin}.',
  analysisIncomeNoCogs: 'La empresa registró ingresos totales de {revenue}.',
  analysisMargin: ' (margen de {margin})',
  analysisExpenses: 'Los gastos operativos sumaron {expenses}.',
  analysisExpensesLed: 'Los gastos operativos sumaron {expenses} — encabezados por {items}.',
  analysisNetIncome: 'El período cerró con una utilidad neta de {netIncome}.',
  analysisNetLoss: 'El período cerró con una pérdida neta de {netIncome}.',
  analysisAssets:
    'Los activos totales se ubicaron en {assets}, frente a pasivos totales de {liabilities} y patrimonio de {equity}.',
  analysisWorkingCapital:
    'El capital de trabajo fue de {workingCapital}, una razón corriente de {currentRatio}.',
  closing:
    'El estado completo se presenta en las páginas siguientes. Si tiene alguna pregunta sobre estas cifras, no dude en comunicarse con nuestra oficina.',
  sincerely: 'Atentamente,',
  totalColumn: 'TOTAL ({currency})',
  continued: 'continuación',
  continuedSection: '{section} (CONTINUACIÓN)',
  footerLeft: 'Preparado por {firm} · {signer}, {role}',
  footerRight: '{basis} · Todos los montos en {currency}',
  noComparative: 'Este estado no incluye columna comparativa.',
};

const LABELS: Record<string, ReportLabels> = { en: EN, es: ES };

export function reportLabels(locale: string): ReportLabels {
  return LABELS[locale.slice(0, 2)] ?? EN;
}
