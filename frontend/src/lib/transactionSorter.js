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
 * Creates a reliable machine-readable ISO datetime string using the device's
 * current local date and time, optionally preserving a user-chosen date.
 *
 * @param {string} [selectedDate] - Optional date in YYYY-MM-DD format
 * @returns {string} ISO 8601 string representing device date + time
 */
export function createTransactionDateTime(selectedDate) {
  const now = new Date();
  if (!selectedDate) {
    return now.toISOString();
  }

  // Format today's local date as YYYY-MM-DD
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  if (selectedDate === todayStr) {
    return now.toISOString();
  }

  // User picked a different date; attach current device hours, minutes, seconds
  const parts = selectedDate.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const combined = new Date(y, m, d, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    if (!isNaN(combined.getTime())) {
      return combined.toISOString();
    }
  }

  return now.toISOString();
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

  const d = new Date(dateTimeValue);
  if (isNaN(d.getTime())) {
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
  const timeA = new Date(a.transactionDateTime || a.createdAt || a.expenseDate || a.incomeDate || 0).getTime();
  const timeB = new Date(b.transactionDateTime || b.createdAt || b.expenseDate || b.incomeDate || 0).getTime();

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
