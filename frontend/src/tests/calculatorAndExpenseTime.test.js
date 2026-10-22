import assert from 'node:assert';
import {
  parseDateTime,
  getLocalDateAndTimeString,
  combineDateAndTime,
  createTransactionDateTime,
  updateTransactionDateTime,
  formatTransactionDateTime,
  compareTransactions,
  sortTransactions
} from '../lib/transactionSorter.js';

console.log('--- Starting Verification Tests ---');

// 1. Timezone-Safe Date Parsing Tests
{
  console.log('1. Testing parseDateTime...');
  assert.strictEqual(parseDateTime(null), null);
  assert.strictEqual(parseDateTime(''), null);

  // YYYY-MM-DD should construct local date without negative UTC day shift
  const dateOnly = parseDateTime('2026-10-22');
  assert.strictEqual(dateOnly.getFullYear(), 2026);
  assert.strictEqual(dateOnly.getMonth(), 9); // 0-indexed: 9 is October
  assert.strictEqual(dateOnly.getDate(), 22);

  // Full ISO string
  const isoStr = '2026-10-22T17:42:30.500Z';
  const parsedIso = parseDateTime(isoStr);
  assert.strictEqual(parsedIso.toISOString(), isoStr);
  console.log('  ✓ parseDateTime passed');
}

// 2. getLocalDateAndTimeString Tests
{
  console.log('2. Testing getLocalDateAndTimeString...');
  const testDate = new Date(2026, 9, 22, 17, 42, 37);
  const { dateStr, timeStr } = getLocalDateAndTimeString(testDate);
  assert.strictEqual(dateStr, '2026-10-22');
  assert.strictEqual(timeStr, '17:42');
  console.log('  ✓ getLocalDateAndTimeString passed');
}

// 3. combineDateAndTime Tests
{
  console.log('3. Testing combineDateAndTime...');
  const origDate = new Date(2026, 9, 22, 17, 42, 37, 123);
  const origIso = origDate.toISOString();

  // Preserves existing seconds and ms when hours & minutes unchanged
  const combinedSameTime = combineDateAndTime('2026-10-22', '17:42', origIso);
  const parsedSame = new Date(combinedSameTime);
  assert.strictEqual(parsedSame.getFullYear(), 2026);
  assert.strictEqual(parsedSame.getMonth(), 9);
  assert.strictEqual(parsedSame.getDate(), 22);
  assert.strictEqual(parsedSame.getHours(), 17);
  assert.strictEqual(parsedSame.getMinutes(), 42);
  assert.strictEqual(parsedSame.getSeconds(), 37);

  // Editing Date independently preserves time
  const combinedDifferentDate = combineDateAndTime('2026-10-25', '17:42', origIso);
  const parsedDiffDate = new Date(combinedDifferentDate);
  assert.strictEqual(parsedDiffDate.getFullYear(), 2026);
  assert.strictEqual(parsedDiffDate.getMonth(), 9);
  assert.strictEqual(parsedDiffDate.getDate(), 25);
  assert.strictEqual(parsedDiffDate.getHours(), 17);
  assert.strictEqual(parsedDiffDate.getMinutes(), 42);

  // Editing Time independently preserves date and sets clean minute precision
  const combinedDifferentTime = combineDateAndTime('2026-10-22', '09:15', origIso);
  const parsedDiffTime = new Date(combinedDifferentTime);
  assert.strictEqual(parsedDiffTime.getFullYear(), 2026);
  assert.strictEqual(parsedDiffTime.getMonth(), 9);
  assert.strictEqual(parsedDiffTime.getDate(), 22);
  assert.strictEqual(parsedDiffTime.getHours(), 9);
  assert.strictEqual(parsedDiffTime.getMinutes(), 15);
  assert.strictEqual(parsedDiffTime.getSeconds(), 0);
  console.log('  ✓ combineDateAndTime passed');
}

// 4. Chronological Sorting Newest -> Oldest
{
  console.log('4. Testing compareTransactions and sortTransactions...');
  const t1 = { id: 't1', transactionDateTime: combineDateAndTime('2026-10-22', '10:00') };
  const t2 = { id: 't2', transactionDateTime: combineDateAndTime('2026-10-22', '17:42') };
  const t3 = { id: 't3', transactionDateTime: combineDateAndTime('2026-10-21', '23:59') };
  const t4 = { id: 't4', transactionDateTime: combineDateAndTime('2026-10-22', '17:42') }; // Equal time, test tie-breaker

  const sorted = sortTransactions([t1, t3, t2, t4]);
  // Newest should be t2 or t4 (17:42), then t1 (10:00), then t3 (previous day)
  assert.strictEqual(sorted[0].id, 't4'); // id 't4' > 't2' in DESC tie-breaker
  assert.strictEqual(sorted[1].id, 't2');
  assert.strictEqual(sorted[2].id, 't1');
  assert.strictEqual(sorted[3].id, 't3');

  // Verify that editing an expense's time moves it to its new chronological position
  const t3Edited = { ...t3, transactionDateTime: combineDateAndTime('2026-10-22', '18:00') };
  const resorted = sortTransactions([sorted[0], sorted[1], sorted[2], t3Edited]);
  assert.strictEqual(resorted[0].id, 't3'); // Now t3 is the newest at 18:00
  console.log('  ✓ sortTransactions passed');
}

// 5. Calculator Undo and Expression State Simulation
{
  console.log('5. Testing Calculator state and Undo simulation...');

  function createCalculator() {
    let display = '0';
    let stored = null;
    let operator = null;
    let freshOperand = true;

    function inputDigit(digit) {
      if (freshOperand) {
        display = digit === '.' ? '0.' : digit;
      } else if (digit === '.' && display.includes('.')) {
        // ignore duplicate dot
      } else if (display === '0' && digit !== '.') {
        display = digit;
      } else {
        display = display + digit;
      }
      freshOperand = false;
    }

    function clearAll() {
      display = '0';
      stored = null;
      operator = null;
      freshOperand = true;
    }

    function chooseOperator(nextOp) {
      if (operator && stored !== null && !freshOperand) {
        // compute
        const x = parseFloat(stored);
        const y = parseFloat(display);
        let res = '0';
        if (operator === '+') res = String(x + y);
        if (operator === '−') res = String(x - y);
        if (operator === '×') res = String(x * y);
        if (operator === '÷') res = y === 0 ? 'Error' : String(x / y);
        stored = res;
        display = res;
      } else {
        stored = display;
      }
      operator = nextOp;
      freshOperand = true;
    }

    function handleEquals() {
      if (!operator || stored === null) return;
      const x = parseFloat(stored);
      const y = parseFloat(display);
      let res = '0';
      if (operator === '+') res = String(x + y);
      if (operator === '−') res = String(x - y);
      if (operator === '×') res = String(x * y);
      if (operator === '÷') res = y === 0 ? 'Error' : String(x / y);
      display = res;
      stored = null;
      operator = null;
      freshOperand = true;
    }

    function handleUndo() {
      if (display === 'Error') {
        display = '0';
        freshOperand = true;
        return;
      }

      // 2nd operand active
      if (operator !== null && stored !== null && !freshOperand) {
        if (display.length > 1) {
          const next = display.slice(0, -1);
          if (next === '-' || next === '' || next === '-0') {
            display = '0';
            freshOperand = true;
          } else {
            display = next;
          }
        } else {
          display = '0';
          freshOperand = true;
        }
        return;
      }

      // Operator chosen, but 2nd operand not yet typed
      if (operator !== null && stored !== null && freshOperand) {
        display = stored;
        stored = null;
        operator = null;
        freshOperand = false;
        return;
      }

      // 1st operand or result
      if (display && display !== '0') {
        if (display.length > 1) {
          const next = display.slice(0, -1);
          if (next === '-' || next === '' || next === '-0') {
            display = '0';
            freshOperand = true;
          } else {
            display = next;
            freshOperand = false;
          }
        } else {
          display = '0';
          freshOperand = true;
        }
      }
    }

    function getExpression() {
      return operator && stored !== null
        ? `${stored} ${operator} ${freshOperand ? '' : display}`
        : '';
    }

    return {
      inputDigit,
      clearAll,
      chooseOperator,
      handleEquals,
      handleUndo,
      getState: () => ({ display, stored, operator, freshOperand, expression: getExpression() })
    };
  }

  // Test 1: Enter several digits and press Undo
  {
    const calc = createCalculator();
    calc.inputDigit('1');
    calc.inputDigit('2');
    calc.inputDigit('3');
    assert.strictEqual(calc.getState().display, '123');
    calc.handleUndo();
    assert.strictEqual(calc.getState().display, '12');
    calc.handleUndo();
    assert.strictEqual(calc.getState().display, '1');
    calc.handleUndo();
    assert.strictEqual(calc.getState().display, '0');
    // Undo on 0 does nothing
    calc.handleUndo();
    assert.strictEqual(calc.getState().display, '0');
  }

  // Test 2: Enter decimal number and press Undo
  {
    const calc = createCalculator();
    calc.inputDigit('4');
    calc.inputDigit('5');
    calc.inputDigit('.');
    calc.inputDigit('6');
    calc.inputDigit('7');
    assert.strictEqual(calc.getState().display, '45.67');
    calc.handleUndo();
    assert.strictEqual(calc.getState().display, '45.6');
    calc.handleUndo();
    assert.strictEqual(calc.getState().display, '45.');
    calc.handleUndo();
    assert.strictEqual(calc.getState().display, '45');
  }

  // Test 3: Expression with multiple operators and Undo
  {
    const calc = createCalculator();
    calc.inputDigit('1');
    calc.inputDigit('2');
    calc.chooseOperator('+');
    calc.inputDigit('3');
    calc.inputDigit('4');
    assert.strictEqual(calc.getState().expression, '12 + 34');
    calc.handleUndo();
    assert.strictEqual(calc.getState().expression, '12 + 3');
    assert.strictEqual(calc.getState().display, '3');
    calc.handleUndo();
    assert.strictEqual(calc.getState().expression, '12 + ');
    calc.handleUndo(); // undoes operator '+'
    assert.strictEqual(calc.getState().display, '12');
    assert.strictEqual(calc.getState().operator, null);
    assert.strictEqual(calc.getState().expression, '');
  }

  // Test 4: 8 * 25 -> Undo -> 8 * 2
  {
    const calc = createCalculator();
    calc.inputDigit('8');
    calc.chooseOperator('×');
    calc.inputDigit('2');
    calc.inputDigit('5');
    assert.strictEqual(calc.getState().expression, '8 × 25');
    calc.handleUndo();
    assert.strictEqual(calc.getState().expression, '8 × 2');
    assert.strictEqual(calc.getState().display, '2');
  }

  // Test 5: Calculate result and then Undo
  {
    const calc = createCalculator();
    calc.inputDigit('1');
    calc.inputDigit('2');
    calc.chooseOperator('+');
    calc.inputDigit('3');
    calc.inputDigit('4');
    calc.handleEquals();
    assert.strictEqual(calc.getState().display, '46');
    calc.handleUndo();
    assert.strictEqual(calc.getState().display, '4');
    // Can continue typing
    calc.inputDigit('5');
    assert.strictEqual(calc.getState().display, '45');
    calc.chooseOperator('+');
    calc.inputDigit('5');
    calc.handleEquals();
    assert.strictEqual(calc.getState().display, '50');
  }

  // Test 6: Clear still works independently
  {
    const calc = createCalculator();
    calc.inputDigit('9');
    calc.inputDigit('9');
    calc.chooseOperator('÷');
    calc.inputDigit('3');
    calc.clearAll();
    assert.strictEqual(calc.getState().display, '0');
    assert.strictEqual(calc.getState().stored, null);
    assert.strictEqual(calc.getState().operator, null);
    assert.strictEqual(calc.getState().freshOperand, true);
  }

  // Test 7: Error handling
  {
    const calc = createCalculator();
    calc.inputDigit('5');
    calc.chooseOperator('÷');
    calc.inputDigit('0');
    calc.handleEquals();
    assert.strictEqual(calc.getState().display, 'Error');
    calc.handleUndo();
    assert.strictEqual(calc.getState().display, '0');
  }

  console.log('  ✓ Calculator Undo and expression simulation passed');
}

console.log('--- ALL TESTS PASSED SUCCESSFULLY! ---');
