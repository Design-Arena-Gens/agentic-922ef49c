const storageKey = "spendwise-expenses";

const dom = {
  form: document.querySelector("#expense-form"),
  formDate: document.querySelector("#expense-date"),
  rows: document.querySelector("#expense-rows"),
  emptyState: document.querySelector("#empty-state"),
  totalSpend: document.querySelector("#total-spend"),
  totalCount: document.querySelector("#total-count"),
  monthlyAverage: document.querySelector("#monthly-average"),
  topCategory: document.querySelector("#top-category"),
  topCategoryAmount: document.querySelector("#top-category-amount"),
  filterFrom: document.querySelector("#filter-from"),
  filterTo: document.querySelector("#filter-to"),
  resetFilters: document.querySelector("#reset-filters"),
  themeToggle: document.querySelector("#theme-toggle"),
  body: document.body,
};

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

let expenses = loadExpenses();
let filters = {
  from: null,
  to: null,
};

let categoryChart = null;
let monthlyChart = null;

initialize();

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function initialize() {
  setInitialDate();
  hydrateTheme();
  attachListeners();
  render();
}

function setInitialDate() {
  const today = new Date().toISOString().split("T")[0];
  dom.formDate.value = today;
  dom.filterTo.value = today;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  dom.filterFrom.value = thirtyDaysAgo.toISOString().split("T")[0];
  filters = { from: dom.filterFrom.value, to: dom.filterTo.value };
}

function hydrateTheme() {
  const stored = localStorage.getItem("spendwise-theme");
  if (stored === "dark") {
    dom.body.classList.add("dark");
    dom.themeToggle.checked = true;
  }
}

function attachListeners() {
  dom.form.addEventListener("submit", handleSubmit);
  dom.rows.addEventListener("click", handleTableAction);
  dom.filterFrom.addEventListener("change", handleFilterChange);
  dom.filterTo.addEventListener("change", handleFilterChange);
  dom.resetFilters.addEventListener("click", handleResetFilters);
  dom.themeToggle.addEventListener("change", handleThemeToggle);
}

function handleSubmit(event) {
  event.preventDefault();
  const formData = new FormData(dom.form);
  const expense = {
    id: createId(),
    name: formData.get("name").trim(),
    amount: parseFloat(formData.get("amount")),
    category: formData.get("category"),
    date: formData.get("date"),
    notes: formData.get("notes").trim(),
    createdAt: new Date().toISOString(),
  };

  if (!expense.name || Number.isNaN(expense.amount) || !expense.date) {
    return;
  }

  expenses.push(expense);
  persistExpenses();
  dom.form.reset();
  dom.formDate.value = expense.date;
  render();
}

function handleTableAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === "delete") {
    expenses = expenses.filter((expense) => expense.id !== id);
    persistExpenses();
    render();
  }
}

function handleFilterChange() {
  filters = {
    from: dom.filterFrom.value || null,
    to: dom.filterTo.value || null,
  };
  render();
}

function handleResetFilters() {
  dom.filterFrom.value = "";
  dom.filterTo.value = "";
  filters = { from: null, to: null };
  render();
}

function handleThemeToggle() {
  dom.body.classList.toggle("dark", dom.themeToggle.checked);
  localStorage.setItem(
    "spendwise-theme",
    dom.themeToggle.checked ? "dark" : "light"
  );
}

function render() {
  const filtered = applyFilters(expenses);
  renderTable(filtered);
  renderSummary(filtered);
  renderCharts(filtered);
}

function renderTable(filtered) {
  dom.rows.innerHTML = "";

  if (!filtered.length) {
    dom.emptyState.hidden = false;
    return;
  }

  dom.emptyState.hidden = true;

  const fragment = document.createDocumentFragment();
  filtered
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .forEach((expense) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${dateFormatter.format(new Date(expense.date))}</td>
        <td>${sanitize(expense.name)}</td>
        <td>${sanitize(expense.category)}</td>
        <td>${currencyFormatter.format(expense.amount)}</td>
        <td>${expense.notes ? sanitize(expense.notes) : "—"}</td>
        <td class="actions">
          <button class="action-button" data-action="delete" data-id="${expense.id}">
            Remove
          </button>
        </td>
      `;
      fragment.appendChild(tr);
    });

  dom.rows.appendChild(fragment);
}

function renderSummary(filtered) {
  const total = filtered.reduce((sum, expense) => sum + expense.amount, 0);
  dom.totalSpend.textContent = currencyFormatter.format(total);
  dom.totalCount.textContent = `${filtered.length} ${
    filtered.length === 1 ? "expense" : "expenses"
  }`;

  const monthlyData = groupByMonth(filtered);
  const monthlyAverage =
    monthlyData.length === 0
      ? 0
      : monthlyData.reduce((sum, item) => sum + item.total, 0) /
        monthlyData.length;

  dom.monthlyAverage.textContent = currencyFormatter.format(monthlyAverage);

  if (filtered.length === 0) {
    dom.topCategory.textContent = "–";
    dom.topCategoryAmount.textContent = currencyFormatter.format(0);
    return;
  }

  const totalsByCategory = categoryTotals(filtered);
  const [topCategory, topAmount] = totalsByCategory.reduce(
    (best, entry) => (entry.total > best[1] ? [entry.category, entry.total] : best),
    ["–", 0]
  );

  dom.topCategory.textContent = topCategory;
  dom.topCategoryAmount.textContent = currencyFormatter.format(topAmount);
}

function renderCharts(filtered) {
  const categoryData = categoryTotals(filtered);
  const monthlyData = groupByMonth(filtered);

  if (!categoryChart) {
    categoryChart = new Chart(document.querySelector("#category-chart"), {
      type: "doughnut",
      data: {
        labels: [],
        datasets: [
          {
            label: "Spend",
            data: [],
            backgroundColor: [
              "#2563eb",
              "#7c3aed",
              "#ec4899",
              "#14b8a6",
              "#f97316",
              "#10b981",
              "#fbbf24",
              "#6366f1",
              "#f87171",
            ],
            borderWidth: 0,
          },
        ],
      },
      options: {
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 12, padding: 16 } },
        },
      },
    });
  }

  categoryChart.data.labels = categoryData.map((item) => item.category);
  categoryChart.data.datasets[0].data = categoryData.map((item) => item.total);
  categoryChart.update();

  if (!monthlyChart) {
    monthlyChart = new Chart(document.querySelector("#monthly-chart"), {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Monthly Spend",
            data: [],
            fill: true,
            tension: 0.4,
            borderColor: "#2563eb",
            backgroundColor: "rgba(37, 99, 235, 0.18)",
            pointRadius: 5,
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          y: {
            ticks: {
              callback: (value) => currencyFormatter.format(value),
            },
            beginAtZero: true,
            grid: { color: "rgba(148, 163, 184, 0.2)" },
          },
          x: {
            grid: { display: false },
          },
        },
      },
    });
  }

  monthlyChart.data.labels = monthlyData.map((item) => item.label);
  monthlyChart.data.datasets[0].data = monthlyData.map((item) => item.total);
  monthlyChart.update();
}

function applyFilters(data) {
  if (!filters.from && !filters.to) return [...data];
  const from = filters.from ? new Date(filters.from) : null;
  const to = filters.to ? new Date(filters.to) : null;

  return data.filter((expense) => {
    const date = new Date(expense.date);
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  });
}

function categoryTotals(data) {
  const totals = new Map();
  data.forEach((expense) => {
    const current = totals.get(expense.category) ?? 0;
    totals.set(expense.category, current + expense.amount);
  });

  return Array.from(totals.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

function groupByMonth(data) {
  const totals = new Map();
  data.forEach((expense) => {
    const date = new Date(expense.date);
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
    const label = date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
    });
    const current = totals.get(key) ?? { label, total: 0 };
    current.total += expense.amount;
    totals.set(key, current);
  });

  return Array.from(totals.entries())
    .sort(([aKey], [bKey]) => (aKey > bKey ? 1 : -1))
    .map(([, value]) => value);
}

function loadExpenses() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      const seeded = sampleExpenses();
      localStorage.setItem(storageKey, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return sampleExpenses();
    return parsed;
  } catch {
    return sampleExpenses();
  }
}

function persistExpenses() {
  localStorage.setItem(storageKey, JSON.stringify(expenses));
}

function sampleExpenses() {
  const today = new Date();
  const makeDate = (offset) => {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    return date.toISOString().split("T")[0];
  };

  return [
    {
      id: createId(),
      name: "Grocery run",
      amount: 68.5,
      category: "Groceries",
      date: makeDate(2),
      notes: "Weekly staples",
      createdAt: new Date().toISOString(),
    },
    {
      id: createId(),
      name: "Monthly rent",
      amount: 1450,
      category: "Housing",
      date: makeDate(10),
      notes: "",
      createdAt: new Date().toISOString(),
    },
    {
      id: createId(),
      name: "Date night dinner",
      amount: 92.75,
      category: "Dining",
      date: makeDate(6),
      notes: "Anniversary",
      createdAt: new Date().toISOString(),
    },
    {
      id: createId(),
      name: "Gym membership",
      amount: 55,
      category: "Health",
      date: makeDate(14),
      notes: "",
      createdAt: new Date().toISOString(),
    },
  ];
}

function sanitize(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}
