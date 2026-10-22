/**
 * Centralized transaction sorting, date/time formatting,
 * and category aggregation utilities for offline-first operation.
 */

export const BUILT_IN_CATEGORIES = [
  'Food',
  'Grocery',
  'Transport',
  'Shopping',
  'Medical',
  'Education',
  'Entertainment',
  'Bills',
  'Fuel'
];

/**
 * Checks whether a given category is a built-in category (case-insensitive).
 */
export function isBuiltInCategory(category) {
  if (!category) return false;
  const normalized = category.trim().toLowerCase();
  return BUILT_IN_CATEGORIES.some(c => c.toLowerCase() === normalized);
}

/**
 * Single source of truth alias for default/built-in category check
 */
export const isDefaultCategory = isBuiltInCategory;

/**
 * Dynamically determines all custom categories used by expenses
 * (all expense categories MINUS default categories)
 * @param {Array} expenses
 * @returns {Array<string>}
 */
export function getCustomExpenseCategories(expenses) {
  if (!Array.isArray(expenses)) return [];
  const customSet = new Set();
  expenses.forEach(e => {
    const cat = (e.category || '').trim();
    if (cat && !isDefaultCategory(cat) && cat.toLowerCase() !== 'others') {
      customSet.add(cat);
    }
  });
  return Array.from(customSet).sort((a, b) => a.localeCompare(b));
}

/**
 * Timezone-safe date/time parser:
 * Parses ISO strings, Date instances, timestamps, or date-only strings (YYYY-MM-DD).
 * For date-only strings, constructs local Date at midnight to avoid UTC negative-offset rollover.
 *
 * @param {string|Date|number} value
 * @returns {Date|null} Valid Date object or null
 */
export function parseDateTime(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // YYYY-MM-DD date-only string: construct local Date at midnight
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split('-').map(n => parseInt(n, 10));
      const localDate = new Date(y, m - 1, d, 0, 0, 0, 0);
      return isNaN(localDate.getTime()) ? null : localDate;
    }
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Extracts formatted local date (YYYY-MM-DD) and local time (HH:mm) from a datetime value.
 *
 * @param {string|Date|number} [dateTimeValue]
 * @returns {{ dateStr: string, timeStr: string }}
 */
export function getLocalDateAndTimeString(dateTimeValue) {
  const d = parseDateTime(dateTimeValue) || new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  return {
    dateStr: `${year}-${month}-${day}`,
    timeStr: `${hours}:${minutes}`
  };
}

/**
 * Combines a local date string (YYYY-MM-DD) and a local time string (HH:mm or HH:mm:ss)
 * into a canonical ISO 8601 string representing that exact instant in the device's local timezone.
 *
 * Preserves seconds and milliseconds from originalIsoString if available and minute was not altered.
 *
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @param {string} [timeStr] - Time in HH:mm or HH:mm:ss format
 * @param {string|Date} [originalIsoString] - Optional original timestamp to preserve seconds/ms
 * @returns {string} Canonical ISO 8601 string
 */
export function combineDateAndTime(dateStr, timeStr, originalIsoString) {
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth();
  let d = now.getDate();

  if (dateStr && typeof dateStr === 'string') {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      y = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10) - 1;
      d = parseInt(parts[2], 10);
    }
  }

  let hh = now.getHours();
  let mm = now.getMinutes();
  let ss = now.getSeconds();
  let ms = now.getMilliseconds();

  if (timeStr && typeof timeStr === 'string') {
    const timeParts = timeStr.split(':');
    if (timeParts.length >= 2) {
      hh = parseInt(timeParts[0], 10) || 0;
      mm = parseInt(timeParts[1], 10) || 0;
      if (timeParts.length >= 3) {
        ss = parseInt(timeParts[2], 10) || 0;
        ms = 0;
      } else {
        // UI provided minute precision (HH:mm); check if original had matching hour & minute
        let preserved = false;
        if (originalIsoString) {
          const orig = parseDateTime(originalIsoString);
          if (orig && orig.getHours() === hh && orig.getMinutes() === mm) {
            ss = orig.getSeconds();
            ms = orig.getMilliseconds();
            preserved = true;
          }
        }
        if (!preserved) {
          ss = 0;
          ms = 0;
        }
      }
    }
  } else if (originalIsoString) {
    const orig = parseDateTime(originalIsoString);
    if (orig) {
      hh = orig.getHours();
      mm = orig.getMinutes();
      ss = orig.getSeconds();
      ms = orig.getMilliseconds();
    }
  }

  const combined = new Date(y, m, d, hh, mm, ss, ms);
  return !isNaN(combined.getTime()) ? combined.toISOString() : now.toISOString();
}

/**
 * Creates a reliable machine-readable ISO datetime string using the device's
 * current local date and time, optionally combining user-chosen date and time.
 *
 * @param {string} [selectedDate] - Optional date in YYYY-MM-DD format
 * @param {string} [selectedTime] - Optional time in HH:mm format
 * @returns {string} ISO 8601 string representing device date + time
 */
export function createTransactionDateTime(selectedDate, selectedTime) {
  if (selectedDate && selectedTime) {
    return combineDateAndTime(selectedDate, selectedTime);
  }
  if (selectedDate) {
    return combineDateAndTime(selectedDate, null);
  }
  return new Date().toISOString();
}

/**
 * Updates a transaction's datetime string with a new selected date (YYYY-MM-DD)
 * and optional time (HH:mm), preserving original time-of-day if available.
 *
 * @param {string|Date} [existingDateTime] - Optional existing timestamp
 * @param {string} [newSelectedDate] - New date in YYYY-MM-DD format
 * @param {string} [newSelectedTime] - Optional new time in HH:mm format
 * @returns {string} ISO 8601 string with the new date and preserved/current time
 */
export function updateTransactionDateTime(existingDateTime, newSelectedDate, newSelectedTime) {
  if (newSelectedDate && newSelectedTime) {
    return combineDateAndTime(newSelectedDate, newSelectedTime, existingDateTime);
  }
  if (newSelectedDate) {
    return combineDateAndTime(newSelectedDate, null, existingDateTime);
  }
  return existingDateTime || createTransactionDateTime();
}

/**
 * Formats a timestamp into human-readable Date and Time strings using the
 * device's local timezone.
 *
 * Display to the user:
 *   Date: 05 Sep 2026
 *   Time: 11:42 AM
 *
 * @param {string|Date|number} dateTimeValue
 * @returns {{ dateStr: string, timeStr: string, fullStr: string }}
 */
export function formatTransactionDateTime(dateTimeValue) {
  if (!dateTimeValue) {
    return { dateStr: '—', timeStr: '—', fullStr: '—' };
  }

  const d = parseDateTime(dateTimeValue);
  if (!d) {
    return { dateStr: String(dateTimeValue), timeStr: '', fullStr: String(dateTimeValue) };
  }

  // Format: "05 Sep 2026"
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('en-US', { month: 'short' });
  const year = d.getFullYear();
  const dateStr = `${day} ${month} ${year}`;

  // Format: "11:42 AM"
  const timeStr = d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  return {
    dateStr,
    timeStr,
    fullStr: `${dateStr}, ${timeStr}`
  };
}

/**
 * Stable deterministic transaction comparator:
 * Primary sort: transactionDateTime DESC (newest -> oldest)
 * Secondary fallback: unique transaction ID DESC (prevents random tie-breaking)
 */
export function compareTransactions(a, b) {
  const dateA = parseDateTime(a.transactionDateTime || a.createdAt || a.expenseDate || a.incomeDate || 0);
  const dateB = parseDateTime(b.transactionDateTime || b.createdAt || b.expenseDate || b.incomeDate || 0);

  const timeA = dateA ? dateA.getTime() : 0;
  const timeB = dateB ? dateB.getTime() : 0;

  if (timeB !== timeA) {
    return timeB - timeA;
  }

  // Secondary deterministic tie-breaker on unique ID DESC
  const idA = String(a.id || '');
  const idB = String(b.id || '');
  return idB.localeCompare(idA);
}

/**
 * Deterministically sorts an array of transactions newest -> oldest.
 * Pure function: does not mutate the source array.
 *
 * @param {Array} transactions
 * @returns {Array} Deterministically sorted transactions
 */
export function sortTransactions(transactions) {
  if (!Array.isArray(transactions)) return [];
  return [...transactions].sort(compareTransactions);
}

/**
 * Aggregates monthly expenses for pie chart reporting:
 * - Built-in categories are represented individually.
 * - All user-created custom categories are aggregated into "Others".
 * - "Others" retains its underlying custom categories and transactions
 *   for interactive drill-down.
 * - Underlying transaction data is NOT modified.
 *
 * @param {Array} expenses - Filtered array of expense objects
 * @param {number} currentYear
 * @param {number} currentMonth - 0-indexed
 * @returns {{ categoryExpenses: Array, monthlyExpenses: number, othersBreakdown: Object }}
 */
export function aggregateCategoriesForChart(expenses, currentYear, currentMonth) {
  const monthExpenses = (expenses || []).filter(e => {
    const dt = e.transactionDateTime || e.expenseDate;
    const d = new Date(dt);
    return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
  });

  const monthlyExpenses = monthExpenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

  const builtInMap = {};
  const customCategoryMap = {};
  const customTransactions = [];

  monthExpenses.forEach(e => {
    const rawCat = (e.category || '').trim();
    const amt = parseFloat(e.amount || 0);

    if (isBuiltInCategory(rawCat)) {
      // Normalize to standard built-in casing
      const standardName = BUILT_IN_CATEGORIES.find(c => c.toLowerCase() === rawCat.toLowerCase()) || rawCat;
      builtInMap[standardName] = (builtInMap[standardName] || 0) + amt;
    } else {
      // User-created / custom category or explicitly "Others"
      const customName = rawCat && rawCat.toLowerCase() !== 'others' ? rawCat : 'Others';
      customCategoryMap[customName] = (customCategoryMap[customName] || 0) + amt;
      customTransactions.push(e);
    }
  });

  const categoryExpenses = [];

  // 1. Add built-in categories
  Object.entries(builtInMap).forEach(([category, amount]) => {
    const percentage = monthlyExpenses > 0 ? parseFloat(((amount / monthlyExpenses) * 100).toFixed(2)) : 0;
    categoryExpenses.push({
      category,
      amount,
      percentage,
      isOthers: false
    });
  });

  // 2. Aggregate custom categories into "Others"
  const customCategoriesList = Object.entries(customCategoryMap)
    .map(([catName, amt]) => ({
      category: catName,
      amount: amt,
      percentage: monthlyExpenses > 0 ? parseFloat(((amt / monthlyExpenses) * 100).toFixed(2)) : 0
    }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));

  const othersTotal = customCategoriesList.reduce((sum, item) => sum + item.amount, 0);

  if (othersTotal > 0) {
    const othersPercentage = monthlyExpenses > 0 ? parseFloat(((othersTotal / monthlyExpenses) * 100).toFixed(2)) : 0;
    categoryExpenses.push({
      category: 'Others',
      amount: othersTotal,
      percentage: othersPercentage,
      isOthers: true,
      customCategories: customCategoriesList,
      transactions: sortTransactions(customTransactions)
    });
  }

  // Deterministic sorting of chart slices: Amount DESC, then Category Name ASC
  categoryExpenses.sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return a.category.localeCompare(b.category);
  });

  return {
    categoryExpenses,
    monthlyExpenses,
    othersBreakdown: {
      total: othersTotal,
      categories: customCategoriesList,
      transactions: sortTransactions(customTransactions)
    }
  };
}
