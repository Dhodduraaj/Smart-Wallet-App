/**
 * Centralized transaction sorting, date/time formatting,
 * and category aggregation utilities for offline-first operation.
 */

export const APP_TIMEZONE = 'Asia/Kolkata';

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
    let trimmed = value.trim();
    if (!trimmed) return null;
    // YYYY-MM-DD date-only string: construct local Date at midnight
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split('-').map(n => parseInt(n, 10));
      const localDate = new Date(y, m - 1, d, 0, 0, 0, 0);
      return isNaN(localDate.getTime()) ? null : localDate;
    }
    // Handle SQL format "YYYY-MM-DD HH:mm:ss" without timezone offset - treat as UTC
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(trimmed)) {
      trimmed = trimmed.replace(' ', 'T') + 'Z';
    }
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Helper to get local date string YYYY-MM-DD in APP_TIMEZONE (Asia/Kolkata)
 */
export function getLocalDateString(d = new Date()) {
  const dateObj = d instanceof Date ? d : (parseDateTime(d) || new Date());
  const target = isNaN(dateObj.getTime()) ? new Date() : dateObj;
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: APP_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(target);
    const partMap = {};
    parts.forEach(p => { partMap[p.type] = p.value; });
    if (partMap.year && partMap.month && partMap.day) {
      return `${partMap.year}-${partMap.month}-${partMap.day}`;
    }
    return formatter.format(target);
  } catch (e) {
    const year = target.getFullYear();
    const month = String(target.getMonth() + 1).padStart(2, '0');
    const day = String(target.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

/**
 * Extracts formatted local date (YYYY-MM-DD) and local time (HH:mm) from a datetime value
 * in Indian Standard Time (Asia/Kolkata).
 *
 * @param {string|Date|number} [dateTimeValue]
 * @returns {{ dateStr: string, timeStr: string }}
 */
export function getLocalDateAndTimeString(dateTimeValue) {
  const d = parseDateTime(dateTimeValue) || new Date();
  
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: APP_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(d);
    const partMap = {};
    parts.forEach(p => { partMap[p.type] = p.value; });
    
    const dateStr = `${partMap.year}-${partMap.month}-${partMap.day}`;
    // Some runtimes output '24' for midnight; normalize to '00'
    const rawHour = parseInt(partMap.hour, 10);
    const normHour = String(rawHour === 24 ? 0 : rawHour).padStart(2, '0');
    const timeStr = `${normHour}:${partMap.minute}`;

    return { dateStr, timeStr };
  } catch (e) {
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
}

/**
 * Combines a local date string (YYYY-MM-DD) and a local time string (HH:mm or HH:mm:ss)
 * representing an instant in Indian Standard Time (Asia/Kolkata, UTC+05:30)
 * into a canonical ISO 8601 UTC string (...Z).
 *
 * Preserves seconds and milliseconds from originalIsoString if available and minute was not altered.
 *
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @param {string} [timeStr] - Time in HH:mm or HH:mm:ss format
 * @param {string|Date} [originalIsoString] - Optional original timestamp to preserve seconds/ms
 * @returns {string} Canonical ISO 8601 UTC string ending in 'Z'
 */
export function combineDateAndTime(dateStr, timeStr, originalIsoString) {
  let y, m, d;
  if (dateStr && typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    const parts = dateStr.trim().split('-');
    y = parseInt(parts[0], 10);
    m = parseInt(parts[1], 10);
    d = parseInt(parts[2], 10);
  } else {
    const nowParts = getLocalDateAndTimeString(new Date());
    const parts = nowParts.dateStr.split('-');
    y = parseInt(parts[0], 10);
    m = parseInt(parts[1], 10);
    d = parseInt(parts[2], 10);
  }

  let hh = 12;
  let mm = 0;
  let ss = 0;
  let ms = 0;

  if (timeStr && typeof timeStr === 'string') {
    const timeParts = timeStr.trim().split(':');
    if (timeParts.length >= 2) {
      hh = parseInt(timeParts[0], 10) || 0;
      mm = parseInt(timeParts[1], 10) || 0;
      if (timeParts.length >= 3) {
        ss = parseInt(timeParts[2], 10) || 0;
      }
    }
  } else if (originalIsoString) {
    const origParts = getLocalDateAndTimeString(originalIsoString);
    if (origParts && origParts.timeStr) {
      const parts = origParts.timeStr.split(':');
      hh = parseInt(parts[0], 10) || 0;
      mm = parseInt(parts[1], 10) || 0;
    }
  } else {
    const nowParts = getLocalDateAndTimeString(new Date());
    const parts = nowParts.timeStr.split(':');
    hh = parseInt(parts[0], 10) || 0;
    mm = parseInt(parts[1], 10) || 0;
  }

  // Preserve milliseconds/seconds from originalIsoString if hour and minute match in IST
  if (originalIsoString) {
    try {
      const origDate = parseDateTime(originalIsoString);
      if (origDate && !isNaN(origDate.getTime())) {
        const origIst = getLocalDateAndTimeString(origDate);
        const [origH, origM] = origIst.timeStr.split(':').map(Number);
        if (origH === hh && origM === mm) {
          ss = origDate.getUTCSeconds();
          ms = origDate.getUTCMilliseconds();
        }
      }
    } catch (e) {}
  }

  const pad2 = n => String(n).padStart(2, '0');
  const pad3 = n => String(n).padStart(3, '0');

  // Construct ISO 8601 string with Indian Standard Time offset (+05:30)
  const istString = `${y}-${pad2(m)}-${pad2(d)}T${pad2(hh)}:${pad2(mm)}:${pad2(ss)}.${pad3(ms)}+05:30`;
  const instant = new Date(istString);
  return !isNaN(instant.getTime()) ? instant.toISOString() : new Date().toISOString();
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

  try {
    const dateFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: APP_TIMEZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    // e.g. "13 Nov 2026"
    const dateStr = dateFormatter.format(d);

    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: APP_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    // e.g. "02:30 PM"
    const timeStr = timeFormatter.format(d);

    return {
      dateStr,
      timeStr,
      fullStr: `${dateStr}, ${timeStr}`
    };
  } catch (e) {
    const day = String(d.getDate()).padStart(2, '0');
    const month = d.toLocaleString('en-US', { month: 'short' });
    const year = d.getFullYear();
    const dateStr = `${day} ${month} ${year}`;
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
    const dt = e.expenseDate || e.transactionDateTime || e.createdAt;
    if (!dt) return false;
    const { dateStr } = getLocalDateAndTimeString(dt);
    if (!dateStr) return false;
    const [y, m] = dateStr.split('-').map(Number);
    return y === currentYear && (m - 1) === currentMonth;
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
