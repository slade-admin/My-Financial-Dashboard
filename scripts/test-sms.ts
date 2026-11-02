/**
 * scripts/test-sms.ts  —  npm run test:sms
 *
 * Pure parser tests, no database. Covers M-Pesa and Kenyan bank alerts and,
 * just as importantly, the messages that must NOT parse: a parser that
 * invents transactions from marketing texts is worse than one that misses.
 */
import { parseSms } from '../src/lib/sms';
import { parseBankSms } from '../src/lib/bank-sms';

let failed = 0;
const ok = (c: boolean, label: string, detail = '') => {
  console.log(`${c ? '✓' : '✗'} ${label}${detail ? '  ' + detail : ''}`);
  if (!c) failed++;
};

console.log('--- M-Pesa (must still work after adding bank support) ---');
for (const [label, sms, kind, amt] of [
  ['send',     'TF34ABC9XY Confirmed. Ksh500.00 sent to JANE WANJIKU 0712345678 on 12/3/24 at 1:15 PM. New M-PESA balance is Ksh2,340.00. Transaction cost, Ksh13.00.', 'send', 500],
  ['receive',  'TF37JKL4BB Confirmed. You have received Ksh90,000.00 from ACME LTD 0700111222 on 28/3/24 at 9:00 AM.', 'receive', 90000],
  ['paybill',  'TF42YZA9GG Confirmed. Ksh1,500.00 sent to KPLC PREPAID for account 123456789 on 12/3/24 at 6:00 PM.', 'paybill', 1500],
  ['withdraw', 'TF41VWX8FF Confirmed.on 12/3/24 at 1:00 PM Withdraw Ksh1,000.00 from 123456 - MAMA MBOGA AGENT New M-PESA balance is Ksh500.00.', 'withdraw', 1000],
] as const) {
  const p = parseSms(sms);
  ok(!!p && p.source === 'mpesa' && p.kind === kind && p.amount === amt,
     `mpesa ${label}`, p ? `${p.source}/${p.kind} ${p.amount}` : 'NOT PARSED');
}

console.log('\n--- Bank alerts ---');
const bank: Array<[string, string, 'income' | 'expense', number, string | undefined]> = [
  ['Equity salary credit',
   'Dear Customer, your Equity account 0123456789 has been credited with KES 90,000.00 on 01/11/2026. Ref: SAL884412. Available balance is KES 120,450.00',
   'income', 90000, 'Equity Bank'],
  ['KCB debit',
   'Confirmed. KES 5,000.00 debited from A/C 1234567890 on 01/11/2026. Ref ABC12345. Balance KES 45,000.00. KCB Bank',
   'expense', 5000, 'KCB Bank'],
  ['Co-op credit no ref',
   'Co-operative Bank: Your account 98****21 has been credited KES 12,500.50 on 31/10/2026. Available balance KES 30,000.00',
   'income', 12500.5, 'Co-operative Bank'],
  ['Absa card purchase',
   'Absa: Purchase of KES 2,350.00 at CARREFOUR on 30/10/2026 from account 5555. Ref TXN99881. Available balance KES 18,200.00',
   'expense', 2350, 'Absa Bank'],
  ['NCBA withdrawal',
   'NCBA: KES 3,000.00 withdrawn from A/C 7788990011 on 29/10/2026 at ATM. Reference WD556677. Balance KES 9,500.00',
   'expense', 3000, 'NCBA Bank'],
  ['Stanbic transfer out',
   'Stanbic Bank: KES 15,000.00 transferred to JOHN OTIENO from account 4321 on 28/10/2026. Ref TRF10293. Available balance KES 55,000.00',
   'expense', 15000, 'Stanbic Bank'],
];
for (const [label, sms, type, amt, inst] of bank) {
  const p = parseSms(sms);
  ok(!!p && p.source === 'bank' && p.type === type && p.amount === amt && p.institution === inst,
     `bank ${label}`,
     p ? `${p.type} ${p.amount} ${p.institution ?? '-'} ${p.date} ref=${p.reference}${p.syntheticReference ? '(synth)' : ''}` : 'NOT PARSED');
}

console.log('\n--- Must NOT parse (false-positive guards) ---');
for (const [label, sms] of [
  ['OTP',            'Your one-time password is 483921. Do not share it. KES 0.00'],
  ['loan marketing', 'Dear Customer, you have been pre-approved for a loan of KES 50,000. Dial *247# to qualify.'],
  ['promo',          'Equity promo! Win KES 1,000,000 this festive season. Offer ends soon.'],
  ['failed txn',     'Your transaction of KES 2,000.00 from account 1234 has FAILED. Ref ERR001.'],
  ['balance only',   'Your Equity account 0123456789 available balance is KES 120,450.00 as at 01/11/2026.'],
  ['plain chat',     'Hey, are we still meeting at 5?'],
] as const) {
  const p = parseSms(sms);
  ok(p === null, `rejects ${label}`, p ? `PARSED AS ${p.type} ${p.amount} <<< FALSE POSITIVE` : '');
}

console.log('\n--- Synthetic reference must be stable (idempotent re-delivery) ---');
const noRef = 'Co-operative Bank: Your account 98****21 has been credited KES 12,500.50 on 31/10/2026. Available balance KES 30,000.00';
const a = parseBankSms(noRef), b = parseBankSms(noRef);
ok(!!a && !!b && a.reference === b.reference && a.syntheticReference,
   'same alert yields the same synthetic reference', a ? a.reference : '');
const different = parseBankSms(noRef.replace('12,500.50', '999.00'));
ok(!!different && different.reference !== a!.reference,
   'a different amount yields a different reference', different?.reference);

console.log(failed === 0 ? '\nAll SMS parser checks passed.' : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
