const STORAGE_KEY = "pocket-budget-state-v2";

const defaultCategories = [
  { id: "housing", name: "Housing", color: "#58727d", removable: false },
  { id: "food", name: "Food", color: "#ef7d57", removable: false },
  { id: "transport", name: "Transport", color: "#efb44f", removable: false },
  { id: "utilities", name: "Bills", color: "#4f7f73", removable: false },
  { id: "health", name: "Health", color: "#5b7cfa", removable: false },
  { id: "lifestyle", name: "Lifestyle", color: "#a16ae8", removable: false },
  { id: "fun", name: "Fun", color: "#ff6f91", removable: false },
  { id: "other", name: "Other", color: "#9aa1a6", removable: false }
];

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const monthPicker = document.getElementById("monthPicker");
const summaryCards = document.getElementById("summaryCards");
const insights = document.getElementById("insights");
const categoryProgress = document.getElementById("categoryProgress");
const budgetCoverageLabel = document.getElementById("budgetCoverageLabel");
const budgetStatusBanner = document.getElementById("budgetStatusBanner");
const healthChip = document.getElementById("healthChip");
const plannedIncomeInput = document.getElementById("plannedIncome");
const startingBalanceInput = document.getElementById("startingBalance");
const savingsGoalInput = document.getElementById("savingsGoal");
const budgetForm = document.getElementById("budgetForm");
const categoryForm = document.getElementById("categoryForm");
const categoryNameInput = document.getElementById("categoryName");
const categoryColorInput = document.getElementById("categoryColor");
const customCategoryList = document.getElementById("customCategoryList");
const transactionForm = document.getElementById("transactionForm");
const transactionTypeSelect = document.getElementById("transactionType");
const transactionAmountInput = document.getElementById("transactionAmount");
const transactionCategorySelect = document.getElementById("transactionCategory");
const transactionDateInput = document.getElementById("transactionDate");
const transactionNoteInput = document.getElementById("transactionNote");
const transactionModeBanner = document.getElementById("transactionModeBanner");
const transactionSubmitButton = document.getElementById("transactionSubmitButton");
const cancelTransactionEditButton = document.getElementById("cancelTransactionEdit");
const transactionList = document.getElementById("transactionList");
const importInput = document.getElementById("importInput");

const appState = loadState();
let editingTransactionId = null;

document.getElementById("planForm").addEventListener("submit", handlePlanSave);
categoryForm.addEventListener("submit", handleAddCategory);
budgetForm.addEventListener("submit", handleBudgetSave);
budgetForm.addEventListener("click", handleBudgetActions);
transactionForm.addEventListener("submit", handleTransactionSave);
transactionTypeSelect.addEventListener("change", populateTransactionCategories);
transactionList.addEventListener("click", handleTransactionActions);
cancelTransactionEditButton.addEventListener("click", () => {
  resetTransactionForm();
  renderTransactionFormState();
});
importInput.addEventListener("change", handleImport);
document.getElementById("exportButton").addEventListener("click", exportData);
document.getElementById("resetButton").addEventListener("click", resetApp);
document.getElementById("jumpToTransaction").addEventListener("click", () => {
  document.getElementById("transactionSection").scrollIntoView({ behavior: "smooth", block: "start" });
  transactionAmountInput.focus();
});
document.getElementById("jumpToPlan").addEventListener("click", () => {
  document.getElementById("planSection").scrollIntoView({ behavior: "smooth", block: "start" });
  plannedIncomeInput.focus();
});

monthPicker.value = currentMonthKey();
monthPicker.addEventListener("change", () => {
  editingTransactionId = null;
  ensureMonth(monthPicker.value);
  render();
});

ensureMonth(monthPicker.value);
render();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (raw) {
      return normalizeState(JSON.parse(raw));
    }

    const legacyRaw = localStorage.getItem("pocket-budget-state-v1");
    if (legacyRaw) {
      const migrated = normalizeState(JSON.parse(legacyRaw));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch (error) {
    console.warn("Failed to load saved budget data. Starting fresh.", error);
  }

  return buildInitialState();
}

function buildInitialState() {
  return {
    categories: defaultCategories.map((category) => ({ ...category })),
    months: {}
  };
}

function normalizeState(state) {
  const normalized = buildInitialState();
  const categoriesById = new Map(defaultCategories.map((category) => [category.id, { ...category }]));

  if (Array.isArray(state?.categories)) {
    for (const category of state.categories) {
      if (!category || typeof category.id !== "string" || typeof category.name !== "string") {
        continue;
      }

      categoriesById.set(category.id, {
        id: category.id,
        name: category.name.trim() || "Untitled",
        color: normalizeColor(category.color),
        removable: defaultCategories.some((item) => item.id === category.id) ? false : category.removable !== false
      });
    }
  }

  normalized.categories = Array.from(categoriesById.values());

  if (state?.months && typeof state.months === "object") {
    for (const [monthKey, monthData] of Object.entries(state.months)) {
      normalized.months[monthKey] = normalizeMonthData(monthData, normalized.categories, monthKey);
    }
  }

  return normalized;
}

function normalizeMonthData(monthData, categories, monthKey = currentMonthKey()) {
  const budgets = {};

  for (const category of categories) {
    budgets[category.id] = sanitizeNumber(monthData?.budgets?.[category.id]);
  }

  const transactions = Array.isArray(monthData?.transactions)
    ? monthData.transactions
        .filter((transaction) => transaction && typeof transaction.id === "string")
        .map((transaction) => ({
          id: transaction.id,
          type: transaction.type === "income" ? "income" : "expense",
          amount: sanitizeNumber(transaction.amount),
          categoryId: typeof transaction.categoryId === "string" ? transaction.categoryId : "other",
          date: isValidDate(transaction.date) ? transaction.date : fallbackDateForMonth(monthKey),
          note: typeof transaction.note === "string" ? transaction.note.slice(0, 60) : ""
        }))
    : [];

  return {
    plannedIncome: sanitizeNumber(monthData?.plannedIncome),
    startingBalance: sanitizeNumber(monthData?.startingBalance),
    savingsGoal: sanitizeNumber(monthData?.savingsGoal),
    budgets,
    transactions
  };
}

function ensureMonth(monthKey) {
  if (!monthKey) {
    return;
  }

  if (!appState.months[monthKey]) {
    appState.months[monthKey] = normalizeMonthData({}, appState.categories, monthKey);
    saveState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (error) {
    console.warn("Failed to save budget data.", error);
  }
}

function persistAndRender() {
  saveState();
  render();
}

function getCurrentMonthData() {
  ensureMonth(monthPicker.value);
  return appState.months[monthPicker.value];
}

function render() {
  const monthData = getCurrentMonthData();
  syncPlanInputs(monthData);
  renderBudgetEditor(monthData);
  renderCustomCategoryList();
  populateTransactionCategories();
  renderTransactionFormState();
  renderSummary(monthData);
  renderInsights(monthData);
  renderTransactions(monthData);
  setDefaultTransactionDate();
}

function syncPlanInputs(monthData) {
  plannedIncomeInput.value = toInputValue(monthData.plannedIncome);
  startingBalanceInput.value = toInputValue(monthData.startingBalance);
  savingsGoalInput.value = toInputValue(monthData.savingsGoal);
}

function renderBudgetEditor(monthData) {
  budgetForm.innerHTML = "";
  const spendByCategory = getSpendByCategory(monthData.transactions);

  for (const category of appState.categories) {
    const row = document.createElement("div");
    row.className = "budget-row";

    const title = document.createElement("div");
    title.className = "budget-row-title";

    const dot = document.createElement("span");
    dot.className = "budget-row-dot";
    dot.style.background = category.color;

    const name = document.createElement("span");
    name.className = "budget-row-name";
    name.textContent = category.name;
    title.append(dot, name);

    const spent = spendByCategory[category.id] || 0;
    const budget = sanitizeNumber(monthData.budgets[category.id]);
    const note = document.createElement("small");
    note.className = "budget-row-note";

    if (budget > 0 && spent > budget) {
      note.classList.add("is-over");
      note.textContent = `Over by ${formatMoney(spent - budget)}`;
    } else if (budget > 0) {
      note.textContent = `${formatMoney(Math.max(budget - spent, 0))} left in budget`;
    } else if (spent > 0) {
      note.classList.add("is-over");
      note.textContent = `${formatMoney(spent)} spent with no budget set`;
    } else {
      note.textContent = "No budget set yet";
    }

    title.append(note);

    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "0.01";
    input.inputMode = "decimal";
    input.name = category.id;
    input.value = toInputValue(monthData.budgets[category.id]);
    input.placeholder = "0.00";
    input.setAttribute("aria-label", `${category.name} budget`);

    row.append(title, input);

    if (category.removable) {
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "icon-button";
      removeButton.dataset.categoryId = category.id;
      removeButton.textContent = "Remove";
      row.append(removeButton);
    } else {
      row.append(document.createElement("div"));
    }

    budgetForm.append(row);
  }

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.className = "primary-button";
  saveButton.textContent = "Save category budgets";
  budgetForm.append(saveButton);
}

function renderCustomCategoryList() {
  if (!customCategoryList) {
    return;
  }

  customCategoryList.innerHTML = "";
  const customCategories = appState.categories.filter((category) => category.removable);

  if (!customCategories.length) {
    customCategoryList.innerHTML = '<div class="empty-state">No custom categories yet. Add as many as you need for your budget.</div>';
    return;
  }

  for (const category of customCategories) {
    const pill = document.createElement("div");
    pill.className = "category-pill";

    const dot = document.createElement("span");
    dot.className = "category-pill-dot";
    dot.style.background = category.color;

    const label = document.createElement("span");
    label.textContent = category.name;

    pill.append(dot, label);
    customCategoryList.append(pill);
  }
}

function renderTransactionFormState() {
  if (!transactionModeBanner || !transactionSubmitButton || !cancelTransactionEditButton) {
    return;
  }

  if (editingTransactionId) {
    transactionModeBanner.className = "status-banner is-visible is-warning";
    transactionModeBanner.textContent = "Editing a saved transaction. Update it below or cancel to create a new one.";
    transactionSubmitButton.textContent = "Update transaction";
    cancelTransactionEditButton.hidden = false;
    return;
  }

  transactionModeBanner.className = "status-banner";
  transactionModeBanner.textContent = "";
  transactionSubmitButton.textContent = "Save transaction";
  cancelTransactionEditButton.hidden = true;
}

function renderSummary(monthData) {
  summaryCards.innerHTML = "";
  const metrics = computeMetrics(monthData);
  const summaryItems = [
    {
      label: "Planned income",
      value: formatMoney(monthData.plannedIncome),
      note: `${formatMoney(metrics.actualIncome)} logged so far`
    },
    {
      label: "Budgeted",
      value: formatMoney(metrics.totalBudgeted),
      note: `${Math.max(0, 100 - metrics.allocationRate)}% unassigned`
    },
    {
      label: "Spent",
      value: formatMoney(metrics.totalSpent),
      note: metrics.remainingBudget >= 0
        ? `${formatMoney(metrics.remainingBudget)} remaining`
        : `${formatMoney(Math.abs(metrics.remainingBudget))} over budget`
    },
    {
      label: "Current balance",
      value: formatMoney(metrics.currentBalance),
      note: `${formatMoney(metrics.savingsGap)} away from savings goal`
    }
  ];

  const template = document.getElementById("summaryCardTemplate");

  for (const item of summaryItems) {
    const fragment = template.content.cloneNode(true);
    fragment.querySelector(".summary-label").textContent = item.label;
    fragment.querySelector(".summary-value").textContent = item.value;
    fragment.querySelector(".summary-note").textContent = item.note;
    summaryCards.append(fragment);
  }
}

function renderInsights(monthData) {
  insights.innerHTML = "";
  categoryProgress.innerHTML = "";

  const metrics = computeMetrics(monthData);
  const dailySpend = metrics.daysElapsed > 0 ? metrics.totalSpent / metrics.daysElapsed : 0;
  const topCategory = metrics.categoryBreakdown.find((item) => item.spent > 0);
  const projected = metrics.currentBalance - (dailySpend * metrics.daysRemaining);
  const planHealth = pickPlanHealth(metrics);

  healthChip.textContent = planHealth.label;
  healthChip.style.background = planHealth.background;
  healthChip.style.color = planHealth.color;
  budgetCoverageLabel.textContent = `${metrics.budgetUseRate}% of budget used`;
  renderBudgetStatusBanner(metrics);

  const insightItems = [
    {
      label: "Top category",
      value: topCategory ? topCategory.name : "No spend yet",
      note: topCategory ? `${formatMoney(topCategory.spent)} spent` : "Your first transaction will appear here."
    },
    {
      label: "Daily burn",
      value: formatMoney(dailySpend),
      note: `Average spending across ${metrics.daysElapsed || 0} day${metrics.daysElapsed === 1 ? "" : "s"}`
    },
    {
      label: "Projected month-end",
      value: formatMoney(projected),
      note: "Based on your current pace"
    },
    {
      label: "Savings progress",
      value: `${metrics.savingsProgress}%`,
      note: `${formatMoney(Math.max(metrics.currentBalance, 0))} available toward the goal`
    }
  ];

  const insightTemplate = document.getElementById("insightTemplate");
  for (const item of insightItems) {
    const fragment = insightTemplate.content.cloneNode(true);
    fragment.querySelector(".insight-label").textContent = item.label;
    fragment.querySelector(".insight-value").textContent = item.value;
    fragment.querySelector(".insight-note").textContent = item.note;
    insights.append(fragment);
  }

  if (!metrics.categoryBreakdown.length) {
    categoryProgress.innerHTML = '<div class="empty-state">Set budgets and start logging transactions to see category progress.</div>';
    return;
  }

  const progressTemplate = document.getElementById("progressTemplate");

  for (const item of metrics.categoryBreakdown) {
    const fragment = progressTemplate.content.cloneNode(true);
    fragment.querySelector(".progress-dot").style.background = item.color;
    fragment.querySelector(".progress-title").textContent = item.name;
    fragment.querySelector(".progress-values").textContent = item.budget > 0
      ? `${formatMoney(item.spent)} / ${formatMoney(item.budget)}`
      : `${formatMoney(item.spent)} spent`;

    const fill = fragment.querySelector(".progress-fill");
    fill.style.width = `${item.spent > 0 ? Math.max(6, Math.min(item.usage, 100)) : 0}%`;
    fill.style.background = item.usage > 100
      ? "linear-gradient(90deg, #a63b38, #ef7d57)"
      : `linear-gradient(90deg, ${item.color}, #ffd18c)`;

    categoryProgress.append(fragment);
  }
}

function renderBudgetStatusBanner(metrics) {
  if (!budgetStatusBanner) {
    return;
  }

  budgetStatusBanner.className = "status-banner is-visible";

  if (metrics.totalBudgeted === 0 && metrics.totalSpent === 0) {
    budgetStatusBanner.classList.add("is-warning");
    budgetStatusBanner.textContent = "Start by setting category budgets so Pocket Budget can tell you exactly when you are over or under target.";
    return;
  }

  if (metrics.remainingBudget < 0) {
    budgetStatusBanner.classList.add("is-danger");
    budgetStatusBanner.textContent = `You are currently over budget by ${formatMoney(Math.abs(metrics.remainingBudget))} this month.`;
    return;
  }

  if (metrics.budgetUseRate >= 80) {
    budgetStatusBanner.classList.add("is-warning");
    budgetStatusBanner.textContent = `You have used ${metrics.budgetUseRate}% of this month's budget and have ${formatMoney(metrics.remainingBudget)} left.`;
    return;
  }

  budgetStatusBanner.classList.add("is-safe");
  budgetStatusBanner.textContent = `You are within budget with ${formatMoney(metrics.remainingBudget)} left across your planned categories.`;
}

function renderTransactions(monthData) {
  transactionList.innerHTML = "";

  if (!monthData.transactions.length) {
    transactionList.innerHTML = '<div class="empty-state">No transactions yet. Add one to start tracking this month.</div>';
    return;
  }

  const sortedTransactions = [...monthData.transactions]
    .sort((a, b) => `${b.date}-${b.id}`.localeCompare(`${a.date}-${a.id}`))
    .slice(0, 12);

  const template = document.getElementById("transactionTemplate");

  for (const transaction of sortedTransactions) {
    const categoryLabel = getTransactionCategoryLabel(transaction.categoryId);
    const fragment = template.content.cloneNode(true);
    const label = transaction.note.trim() || `${transaction.type === "income" ? "Income" : "Expense"} entry`;

    fragment.querySelector(".transaction-note").textContent = label;
    fragment.querySelector(".transaction-amount").textContent = `${transaction.type === "income" ? "+" : "-"}${formatMoney(transaction.amount)}`;
    fragment.querySelector(".transaction-amount").style.color = transaction.type === "income" ? "var(--success)" : "var(--ink)";
    fragment.querySelector(".transaction-meta").textContent = `${categoryLabel} | ${formatHumanDate(transaction.date)}`;
    fragment.querySelector(".edit-transaction").dataset.transactionId = transaction.id;
    fragment.querySelector(".delete-transaction").dataset.transactionId = transaction.id;

    transactionList.append(fragment);
  }
}

function populateTransactionCategories() {
  const previousValue = transactionCategorySelect.value;
  transactionCategorySelect.innerHTML = "";

  const incomeOptions = [
    { id: "paycheck", name: "Paycheck" },
    { id: "side-hustle", name: "Side hustle" },
    { id: "refund", name: "Refund" }
  ];

  const options = transactionTypeSelect.value === "income"
    ? incomeOptions.concat(appState.categories.map((category) => ({ id: category.id, name: category.name })))
    : appState.categories.map((category) => ({ id: category.id, name: category.name }));

  for (const option of options) {
    const element = document.createElement("option");
    element.value = option.id;
    element.textContent = option.name;
    transactionCategorySelect.append(element);
  }

  if ([...transactionCategorySelect.options].some((option) => option.value === previousValue)) {
    transactionCategorySelect.value = previousValue;
  }
}

function handlePlanSave(event) {
  event.preventDefault();
  const monthData = getCurrentMonthData();
  monthData.plannedIncome = sanitizeNumber(plannedIncomeInput.value);
  monthData.startingBalance = sanitizeNumber(startingBalanceInput.value);
  monthData.savingsGoal = sanitizeNumber(savingsGoalInput.value);
  persistAndRender();
}

function handleBudgetSave(event) {
  event.preventDefault();
  const monthData = getCurrentMonthData();
  const formData = new FormData(budgetForm);

  for (const category of appState.categories) {
    monthData.budgets[category.id] = sanitizeNumber(formData.get(category.id));
  }

  persistAndRender();
}

function handleBudgetActions(event) {
  const button = event.target.closest("button[data-category-id]");
  if (!button) {
    return;
  }

  const categoryId = button.dataset.categoryId;
  if (!window.confirm("Remove this category from the app? Existing transactions will move to Other.")) {
    return;
  }

  removeCategory(categoryId);
  persistAndRender();
}

function handleAddCategory(event) {
  event.preventDefault();
  const name = categoryNameInput.value.trim();

  if (!name) {
    window.alert("Enter a category name first.");
    return;
  }

  const id = createUniqueCategoryId(name);
  appState.categories.push({
    id,
    name,
    color: normalizeColor(categoryColorInput.value),
    removable: true
  });

  for (const monthData of Object.values(appState.months)) {
    monthData.budgets[id] = 0;
  }

  categoryForm.reset();
  categoryColorInput.value = "#ef7d57";
  persistAndRender();
}

function removeCategory(categoryId) {
  appState.categories = appState.categories.filter((category) => category.id !== categoryId);

  for (const monthData of Object.values(appState.months)) {
    delete monthData.budgets[categoryId];
    monthData.transactions = monthData.transactions.map((transaction) => ({
      ...transaction,
      categoryId: transaction.categoryId === categoryId ? "other" : transaction.categoryId
    }));
  }
}

function handleTransactionSave(event) {
  event.preventDefault();
  const amount = sanitizeNumber(transactionAmountInput.value);

  if (amount <= 0) {
    window.alert("Add an amount greater than zero.");
    return;
  }

  const monthData = getCurrentMonthData();
  const payload = {
    type: transactionTypeSelect.value === "income" ? "income" : "expense",
    amount,
    categoryId: transactionCategorySelect.value || "other",
    date: transactionDateInput.value || fallbackDateForMonth(monthPicker.value),
    note: transactionNoteInput.value.trim()
  };

  if (editingTransactionId) {
    monthData.transactions = monthData.transactions.map((transaction) => (
      transaction.id === editingTransactionId
        ? { ...transaction, ...payload }
        : transaction
    ));
  } else {
    monthData.transactions.push({
      id: createTransactionId(),
      ...payload
    });
  }

  resetTransactionForm();
  persistAndRender();
}

function handleTransactionActions(event) {
  const editButton = event.target.closest("button.edit-transaction[data-transaction-id]");
  if (editButton) {
    beginTransactionEdit(editButton.dataset.transactionId);
    return;
  }

  const deleteButton = event.target.closest("button.delete-transaction[data-transaction-id]");
  if (!deleteButton) {
    return;
  }

  const monthData = getCurrentMonthData();
  monthData.transactions = monthData.transactions.filter((transaction) => transaction.id !== deleteButton.dataset.transactionId);

  if (editingTransactionId === deleteButton.dataset.transactionId) {
    resetTransactionForm();
  }

  persistAndRender();
}

function beginTransactionEdit(transactionId) {
  const monthData = getCurrentMonthData();
  const transaction = monthData.transactions.find((item) => item.id === transactionId);
  if (!transaction) {
    return;
  }

  editingTransactionId = transaction.id;
  transactionTypeSelect.value = transaction.type;
  populateTransactionCategories();
  transactionCategorySelect.value = transaction.categoryId;
  transactionAmountInput.value = toInputValue(transaction.amount);
  transactionDateInput.value = transaction.date;
  transactionNoteInput.value = transaction.note;
  renderTransactionFormState();
  document.getElementById("transactionSection").scrollIntoView({ behavior: "smooth", block: "start" });
  transactionAmountInput.focus();
}

function resetTransactionForm() {
  editingTransactionId = null;
  transactionForm.reset();
  transactionTypeSelect.value = "expense";
  populateTransactionCategories();
  setDefaultTransactionDate();
}

function handleImport(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const normalized = normalizeState(parsed);
      appState.categories = normalized.categories;
      appState.months = normalized.months;
      editingTransactionId = null;
      ensureMonth(monthPicker.value);
      persistAndRender();
      window.alert("Budget data imported successfully.");
    } catch (error) {
      console.error(error);
      window.alert("That file could not be imported. Please choose a Pocket Budget export.");
    } finally {
      importInput.value = "";
    }
  };
  reader.readAsText(file);
}

function exportData() {
  const blob = new Blob([JSON.stringify(appState, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `pocket-budget-backup-${monthPicker.value || currentMonthKey()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function resetApp() {
  if (!window.confirm("Clear all budgets, categories, and transactions from this browser?")) {
    return;
  }

  const fresh = buildInitialState();
  appState.categories = fresh.categories;
  appState.months = {};
  editingTransactionId = null;
  ensureMonth(monthPicker.value);
  resetTransactionForm();
  persistAndRender();
}

function computeMetrics(monthData) {
  const actualIncome = monthData.transactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalSpent = monthData.transactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalBudgeted = appState.categories.reduce((sum, category) => sum + sanitizeNumber(monthData.budgets[category.id]), 0);
  const currentBalance = monthData.startingBalance + actualIncome - totalSpent;
  const remainingBudget = totalBudgeted - totalSpent;
  const allocationRate = monthData.plannedIncome > 0
    ? Math.min(Math.round((totalBudgeted / monthData.plannedIncome) * 100), 999)
    : 0;
  const budgetUseRate = totalBudgeted > 0
    ? Math.min(Math.round((totalSpent / totalBudgeted) * 100), 999)
    : 0;
  const savingsProgress = monthData.savingsGoal > 0
    ? Math.min(Math.round((Math.max(currentBalance, 0) / monthData.savingsGoal) * 100), 100)
    : 0;
  const savingsGap = monthData.savingsGoal > 0
    ? Math.max(monthData.savingsGoal - Math.max(currentBalance, 0), 0)
    : 0;

  const categoryBreakdown = appState.categories
    .map((category) => {
      const spent = monthData.transactions
        .filter((transaction) => transaction.type === "expense" && transaction.categoryId === category.id)
        .reduce((sum, transaction) => sum + transaction.amount, 0);
      const budget = sanitizeNumber(monthData.budgets[category.id]);
      const usage = budget > 0 ? Math.round((spent / budget) * 100) : (spent > 0 ? 100 : 0);

      return {
        id: category.id,
        name: category.name,
        color: category.color,
        spent,
        budget,
        usage
      };
    })
    .filter((item) => item.budget > 0 || item.spent > 0)
    .sort((a, b) => b.spent - a.spent);

  const dateContext = getDateContext(monthPicker.value);

  return {
    actualIncome,
    totalSpent,
    totalBudgeted,
    currentBalance,
    remainingBudget,
    allocationRate,
    budgetUseRate,
    savingsProgress,
    savingsGap,
    categoryBreakdown,
    daysElapsed: dateContext.daysElapsed,
    daysRemaining: dateContext.daysRemaining
  };
}

function getDateContext(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const now = new Date();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
  const daysInMonth = new Date(year, month, 0).getDate();

  if (isCurrentMonth) {
    return {
      daysElapsed: now.getDate(),
      daysRemaining: Math.max(daysInMonth - now.getDate(), 0)
    };
  }

  return {
    daysElapsed: daysInMonth,
    daysRemaining: 0
  };
}

function pickPlanHealth(metrics) {
  if (metrics.totalBudgeted === 0 && metrics.totalSpent === 0) {
    return {
      label: "Plan not started",
      background: "rgba(15, 61, 62, 0.1)",
      color: "var(--primary)"
    };
  }

  if (metrics.remainingBudget < 0) {
    return {
      label: "Over budget",
      background: "rgba(166, 59, 56, 0.14)",
      color: "var(--danger)"
    };
  }

  if (metrics.budgetUseRate > 80) {
    return {
      label: "Tight runway",
      background: "rgba(239, 125, 87, 0.18)",
      color: "#8c452c"
    };
  }

  return {
    label: "Balanced month",
    background: "rgba(47, 125, 96, 0.14)",
    color: "var(--success)"
  };
}

function findCategory(categoryId) {
  return appState.categories.find((category) => category.id === categoryId) || {
    id: "other",
    name: "Other",
    color: "#9aa1a6"
  };
}

function getTransactionCategoryLabel(categoryId) {
  const incomeLabels = {
    paycheck: "Paycheck",
    "side-hustle": "Side hustle",
    refund: "Refund"
  };

  if (incomeLabels[categoryId]) {
    return incomeLabels[categoryId];
  }

  return findCategory(categoryId).name;
}

function sanitizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function formatMoney(value) {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

function toInputValue(value) {
  return value ? String(value) : "";
}

function normalizeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#ef7d57";
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
}

function createUniqueCategoryId(value) {
  const baseId = slugify(value) || `category-${Date.now()}`;
  let candidate = baseId;
  let suffix = 2;

  while (appState.categories.some((category) => category.id === candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function getSpendByCategory(transactions) {
  const totals = {};

  for (const transaction of transactions) {
    if (transaction.type !== "expense") {
      continue;
    }

    totals[transaction.categoryId] = (totals[transaction.categoryId] || 0) + transaction.amount;
  }

  return totals;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function setDefaultTransactionDate() {
  if (!transactionDateInput.value) {
    transactionDateInput.value = fallbackDateForMonth(monthPicker.value);
  }
}

function fallbackDateForMonth(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const today = new Date();
  const selectedMonth = new Date(year, month - 1, 1);

  if (today.getFullYear() === selectedMonth.getFullYear() && today.getMonth() === selectedMonth.getMonth()) {
    return formatDateInput(today);
  }

  return `${monthKey}-01`;
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "");
}

function formatHumanDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createTransactionId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `txn-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}
