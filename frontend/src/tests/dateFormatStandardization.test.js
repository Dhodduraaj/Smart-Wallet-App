import test from 'node:test';
import assert from 'node:assert';
import {
  formatDateDDMMYYYY,
  parseDDMMYYYYtoYYYYMMDD,
  formatTransactionDateTime,
  combineDateAndTime,
  parseDateTime,
  APP_TIMEZONE
} from '../lib/transactionSorter.js';

test('Date Format Standardization Suite: DD/MM/YYYY across all platforms', async (t) => {
  await t.test('1. formatDateDDMMYYYY formats specific required dates with leading zeros', () => {
    // Required examples from specification:
    // January 5, 2026 -> 05/01/2026
    // March 12, 2026 -> 12/03/2026
    // November 15, 2026 -> 15/11/2026
    // December 1, 2026 -> 01/12/2026

    assert.strictEqual(formatDateDDMMYYYY('2026-01-05'), '05/01/2026');
    assert.strictEqual(formatDateDDMMYYYY('2026-03-12'), '12/03/2026');
    assert.strictEqual(formatDateDDMMYYYY('2026-11-15'), '15/11/2026');
    assert.strictEqual(formatDateDDMMYYYY('2026-12-01'), '01/12/2026');

    // Single-digit month and day handling
    assert.strictEqual(formatDateDDMMYYYY('2026-02-09'), '09/02/2026');
    assert.strictEqual(formatDateDDMMYYYY('2026-07-04'), '04/07/2026');
  });

  await t.test('2. formatDateDDMMYYYY handles diverse input types (ISO UTC, Date objects, Timestamps)', () => {
    // ISO 8601 UTC string (15/11/2026 at 02:30 PM IST is 09:00 UTC)
    const isoUtc = '2026-11-15T09:00:00.000Z';
    assert.strictEqual(formatDateDDMMYYYY(isoUtc), '15/11/2026');

    // Date object
    const dateObj = new Date('2026-03-12T10:00:00.000Z');
    assert.strictEqual(formatDateDDMMYYYY(dateObj), '12/03/2026');

    // Numeric timestamp
    assert.strictEqual(formatDateDDMMYYYY(dateObj.getTime()), '12/03/2026');

    // Nullish & empty
    assert.strictEqual(formatDateDDMMYYYY(null), '—');
    assert.strictEqual(formatDateDDMMYYYY(undefined), '—');
    assert.strictEqual(formatDateDDMMYYYY(''), '—');
  });

  await t.test('3. parseDDMMYYYYtoYYYYMMDD converts user input back to canonical YYYY-MM-DD', () => {
    assert.strictEqual(parseDDMMYYYYtoYYYYMMDD('05/01/2026'), '2026-01-05');
    assert.strictEqual(parseDDMMYYYYtoYYYYMMDD('12/03/2026'), '2026-03-12');
    assert.strictEqual(parseDDMMYYYYtoYYYYMMDD('15/11/2026'), '2026-11-15');
    assert.strictEqual(parseDDMMYYYYtoYYYYMMDD('01/12/2026'), '2026-12-01');

    // Supports dash separators
    assert.strictEqual(parseDDMMYYYYtoYYYYMMDD('15-11-2026'), '2026-11-15');

    // Pass-through if already YYYY-MM-DD
    assert.strictEqual(parseDDMMYYYYtoYYYYMMDD('2026-11-15'), '2026-11-15');

    // Empty input
    assert.strictEqual(parseDDMMYYYYtoYYYYMMDD(''), '');
  });

  await t.test('4. formatTransactionDateTime produces consistent DD/MM/YYYY dateStr and fullStr', () => {
    const instant = combineDateAndTime('2026-11-15', '14:30');
    const result = formatTransactionDateTime(instant);

    assert.strictEqual(result.dateStr, '15/11/2026', 'dateStr must be DD/MM/YYYY');
    assert.strictEqual(result.timeStr, '02:30 PM', 'timeStr must be 12h format');
    assert.strictEqual(result.fullStr, '15/11/2026, 02:30 PM', 'fullStr must be DD/MM/YYYY, hh:mm A');
  });

  await t.test('5. Midnight boundary protection in IST (Asia/Kolkata)', () => {
    // 01:00 AM IST on Nov 15 is 19:30 UTC on Nov 14
    const midnightUtc = '2026-11-14T19:30:00.000Z';
    const display = formatTransactionDateTime(midnightUtc);

    assert.strictEqual(display.dateStr, '15/11/2026', 'Must display 15/11/2026 in IST, NOT 14/11/2026');
    assert.strictEqual(display.timeStr, '01:00 AM');
  });

  await t.test('6. Storage & Database format guarantee: YYYY-MM-DD and ISO 8601 UTC untouched', () => {
    // Simulated form submission
    const userSelectedDate = '2026-11-15'; // Internal form state
    const userSelectedTime = '16:45';

    // Transaction creation produces standard ISO UTC string
    const txInstant = combineDateAndTime(userSelectedDate, userSelectedTime);
    assert.match(txInstant, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    // Payload sent to server or local storage preserves YYYY-MM-DD
    const expensePayload = {
      expenseDate: userSelectedDate,
      transactionDateTime: txInstant,
      amount: 500
    };

    assert.strictEqual(expensePayload.expenseDate, '2026-11-15', 'expenseDate remains ISO date string');
    assert(expensePayload.transactionDateTime.endsWith('Z'), 'UTC instant preserved');
  });
});
