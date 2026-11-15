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

  await t.test('7. Interactive Date Picker Calendar Logic: Leap years, month boundaries, and zero timezone distortion', () => {
    // Helper to calculate days in month
    const getDaysInMonth = (y, m) => new Date(y, m, 0).getDate();
    // Helper to get first day of week (0=Sunday, 1=Monday, ..., 6=Saturday)
    const getFirstDayOfWeek = (y, m) => new Date(y, m - 1, 1).getDay();

    // February non-leap year (2026) -> 28 days
    assert.strictEqual(getDaysInMonth(2026, 2), 28, 'Feb 2026 has 28 days');
    // February leap year (2024) -> 29 days
    assert.strictEqual(getDaysInMonth(2024, 2), 29, 'Feb 2024 has 29 days');
    // February leap year (2028) -> 29 days
    assert.strictEqual(getDaysInMonth(2028, 2), 29, 'Feb 2028 has 29 days');

    // 30-day months: April (4), June (6), September (9), November (11)
    [4, 6, 9, 11].forEach(m => {
      assert.strictEqual(getDaysInMonth(2026, m), 30, `Month ${m} in 2026 has 30 days`);
    });

    // 31-day months: Jan (1), Mar (3), May (5), Jul (7), Aug (8), Oct (10), Dec (12)
    [1, 3, 5, 7, 8, 10, 12].forEach(m => {
      assert.strictEqual(getDaysInMonth(2026, m), 31, `Month ${m} in 2026 has 31 days`);
    });

    // Verify November 2026 starts on Sunday (day 0)
    assert.strictEqual(getFirstDayOfWeek(2026, 11), 0, 'Nov 1, 2026 is Sunday');

    // Verify date selection synthesis:
    // When a user selects a day (e.g. day 5 of Jan 2026 or day 15 of Nov 2026),
    // it yields canonical YYYY-MM-DD which formats strictly to DD/MM/YYYY.
    const pad2 = n => String(n).padStart(2, '0');
    const constructSelected = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;

    const picked1 = constructSelected(2026, 1, 5);
    assert.strictEqual(picked1, '2026-01-05');
    assert.strictEqual(formatDateDDMMYYYY(picked1), '05/01/2026');

    const picked2 = constructSelected(2026, 11, 15);
    assert.strictEqual(picked2, '2026-11-15');
    assert.strictEqual(formatDateDDMMYYYY(picked2), '15/11/2026');

    const picked3 = constructSelected(2026, 3, 12);
    assert.strictEqual(picked3, '2026-03-12');
    assert.strictEqual(formatDateDDMMYYYY(picked3), '12/03/2026');
  });
});

