// A QuickBooks Online General Ledger export in the exact layout the firm
// uploads — title lines, the header row, one section per account, sub-accounts
// inside their parent, "Total for …" lines, the basis footer — with invented
// figures. Never a client's file.
export const LEDGER_CSV = [
  'Demo Coffee Co.,,,,,,,,,',
  'General Ledger (this month),,,,,,,,,',
  'September 2026,,,,,,,,,',
  '',
  ',Distribution account,Transaction date,Transaction type,Num,Name,Description,Split,Amount,Balance',
  'Checking ••4410,,,,,,,,,',
  ',Checking ••4410,09/02/2026,Deposit,,,CARD SALES PAYOUT,4000 - Coffee & food sales,"1,402.18","1,402.18"',
  ',Checking ••4410,09/03/2026,Expense,,Cafe Import Co,Ethiopia 60kg,5000 - Coffee beans,"-2,410.00","-1,007.82"',
  ',Checking ••4410,09/12/2026,Expense,,FPL,ELECTRIC PAYMENT,63001 - Electricity,-512.40,"-1,520.22"',
  ',Checking ••4410,09/20/2026,Expense,,,COMCAST BUSINESS,63005 - Internet,-128.00,"-1,648.22"',
  'Total for Checking ••4410,,,,,,,,"-$1,648.22",',
  'Sales tax payable,,,,,,,,,',
  ',Sales tax payable,09/30/2026,Journal Entry,1004,,,,105.20,105.20',
  'Total for Sales tax payable,,,,,,,,$105.20,',
  '4000 - Coffee & food sales,,,,,,,,,',
  ',4000 - Coffee & food sales,09/02/2026,Deposit,,,CARD SALES PAYOUT,Checking ••4410,"1,402.18","1,402.18"',
  ',4000 - Coffee & food sales,09/09/2026,Deposit,,Toast POS,Card sales payout,Checking ••4410,"1,198.40","2,600.58"',
  ',4000 - Coffee & food sales,09/30/2026,Journal Entry,1004,,,,-105.20,"2,495.38"',
  'Total for 4000 - Coffee & food sales,,,,,,,,"$2,495.38",',
  '5000 - Coffee beans,,,,,,,,,',
  ',5000 - Coffee beans,09/03/2026,Expense,,Cafe Import Co,Ethiopia 60kg,Checking ••4410,"2,410.00","2,410.00"',
  'Total for 5000 - Coffee beans,,,,,,,,"$2,410.00",',
  '6300 - Utilities,,,,,,,,,',
  '63001 - Electricity,,,,,,,,,',
  ',63001 - Electricity,09/12/2026,Expense,,FPL,ELECTRIC PAYMENT,Checking ••4410,512.40,512.40',
  'Total for 63001 - Electricity,,,,,,,,$512.40,',
  '63005 - Internet,,,,,,,,,',
  ',63005 - Internet,09/20/2026,Expense,,,COMCAST BUSINESS,Checking ••4410,128.00,128.00',
  'Total for 63005 - Internet,,,,,,,,$128.00,',
  'Total for 6300 - Utilities with sub-accounts,,,,,,,,$640.40,',
  '',
  '',
  'Accrual Basis Sunday, October 18, 2026 11:47 PM GMT-05:00,,,,,,,,,',
].join('\r\n');

/** The same export with one line changed, so a total no longer adds up. */
export function withLine(find: string, replace: string): string {
  if (!LEDGER_CSV.includes(find)) throw new Error(`fixture line not found: ${find}`);
  return LEDGER_CSV.replace(find, replace);
}
