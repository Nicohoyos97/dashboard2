// Wording for the client-facing PDF reports (KILL-PDF.md).
//
// It lives here rather than in `messages/` for the same reason the CSV headers
// do: the export route sits under /api and is not localized, so it picks its
// language from the request and reads it from a plain table. The English cover
// letter is the firm's P&L Cover Letter Template word for word; keep the two
// languages in step.

export type ReportLabels = {
  profitAndLoss: string;
  balanceSheet: string;
  /** What the cover letter calls the document it encloses. */
  pnlDocument: string;
  balanceDocument: string;
  tagline: string;
  /** The bold line under the client's name: document · period · basis. */
  coverLine: string;
  /** A balance sheet is a snapshot, so the letter dates it instead of ranging it. */
  asOf: string;
  salutation: string;
  introPnl: string;
  introBalance: string;
  /** Cash and accrual record different events; the letter says which ones it summarizes. */
  summaryCash: string;
  summaryAccrual: string;
  summaryBalance: string;
  review: string;
  basisCash: string;
  basisAccrual: string;
  /** The basis inside a sentence, article included ("an accrual basis"). */
  basisCashPhrase: string;
  basisAccrualPhrase: string;
  kpiIncome: string;
  kpiGrossProfit: string;
  kpiExpenses: string;
  kpiNetIncome: string;
  kpiAssets: string;
  kpiLiabilities: string;
  kpiEquity: string;
  kpiWorkingCapital: string;
  closing: string;
  enclosure: string;
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
  pnlDocument: 'Profit & Loss Statement',
  balanceDocument: 'Balance Sheet',
  tagline: 'Bookkeeping & Accounting',
  coverLine: '{document} · {period} · {basis}',
  asOf: 'As of {date}',
  salutation: 'To Whom It May Concern:',
  introPnl:
    'Please find enclosed the {document} for {company} for the period {period}, prepared on {basis}.',
  introBalance:
    'Please find enclosed the {document} for {company} as of {date}, prepared on {basis}.',
  summaryCash:
    'The statement summarizes the income received and expenses paid during the period, based on the bank records, receipts and information provided by your business.',
  summaryAccrual:
    'The statement summarizes the income earned and expenses incurred during the period, based on the bank records, receipts and information provided by your business.',
  summaryBalance:
    'The statement summarizes what the business owns, what it owes and the owner’s equity on that date, based on the bank records, receipts and information provided by your business.',
  review:
    'We recommend reviewing the figures carefully. If you notice any transaction that is missing, duplicated or classified incorrectly, please let us know so we can make the adjustment before the statement is used for tax, lending or management purposes.',
  basisCash: 'Cash Basis',
  basisAccrual: 'Accrual Basis',
  basisCashPhrase: 'a cash basis',
  basisAccrualPhrase: 'an accrual basis',
  kpiIncome: 'Total Income',
  kpiGrossProfit: 'Gross Profit',
  kpiExpenses: 'Total Expenses',
  kpiNetIncome: 'Net Income',
  kpiAssets: 'Total Assets',
  kpiLiabilities: 'Total Liabilities',
  kpiEquity: 'Total Equity',
  kpiWorkingCapital: 'Working Capital',
  closing:
    'This statement was compiled from the information you provided and has not been audited or reviewed. Thank you for the opportunity to support your business. Please do not hesitate to contact me with any questions.',
  enclosure: 'Enclosure: {document}',
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
  pnlDocument: 'Estado de Resultados',
  balanceDocument: 'Balance General',
  tagline: 'Bookkeeping y Contabilidad',
  coverLine: '{document} · {period} · {basis}',
  asOf: 'Al {date}',
  salutation: 'A quien corresponda:',
  introPnl:
    'Adjunto encontrarás el {document} de {company} del período {period}, preparado sobre {basis}.',
  introBalance:
    'Adjunto encontrarás el {document} de {company} al {date}, preparado sobre {basis}.',
  summaryCash:
    'El estado resume los ingresos recibidos y los gastos pagados durante el período, con base en los estados de cuenta del banco, los recibos y la información que nos entregó tu negocio.',
  summaryAccrual:
    'El estado resume los ingresos generados y los gastos incurridos durante el período, con base en los estados de cuenta del banco, los recibos y la información que nos entregó tu negocio.',
  summaryBalance:
    'El estado resume lo que el negocio tiene, lo que debe y el patrimonio del dueño en esa fecha, con base en los estados de cuenta del banco, los recibos y la información que nos entregó tu negocio.',
  review:
    'Te recomendamos revisar las cifras con cuidado. Si ves alguna transacción que falta, que está duplicada o mal clasificada, avísanos. Así la ajustamos antes de que el estado se use para taxes, para pedir un préstamo o para decidir en el negocio.',
  basisCash: 'Base de Caja',
  basisAccrual: 'Base Devengada',
  basisCashPhrase: 'una base de caja',
  basisAccrualPhrase: 'una base devengada',
  kpiIncome: 'Ingresos Totales',
  kpiGrossProfit: 'Utilidad Bruta',
  kpiExpenses: 'Gastos Totales',
  kpiNetIncome: 'Utilidad Neta',
  kpiAssets: 'Activos Totales',
  kpiLiabilities: 'Pasivos Totales',
  kpiEquity: 'Patrimonio Total',
  kpiWorkingCapital: 'Capital de Trabajo',
  closing:
    'Este estado se compiló con la información que nos entregaste y no ha sido auditado ni revisado. Gracias por la oportunidad de apoyar a tu negocio. Si tienes cualquier pregunta, no dudes en contactarme.',
  enclosure: 'Adjunto: {document}',
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
