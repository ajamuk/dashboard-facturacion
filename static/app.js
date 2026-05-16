const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const numberFmt = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
const percentFmt = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1, signDisplay: "exceptZero" });

const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const centerColors = {
  PARLA: "#87B15F",
  "LAS ROSAS": "#121212",
  GETAFE: "#C4C0BF",
};
const comparisonColors = ["#87B15F", "#121212", "#C4C0BF", "#6f8f52", "#8e8988", "#d8d2d1"];

let state = null;
let selectedYear = null;
let selectedMonth = null;
let charts = {};

const metricLabels = {
  facturacion: "Facturacion",
  clientes_activos: "Clientes activos",
  gasto_medio: "Gasto medio",
  altas: "Altas",
  bajas: "Bajas",
  ocupacion_clases: "Ocupacion clases",
  ltv: "LTV",
  permanencia: "Permanencia"
};

function chart(id, config) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), config);
}

function chartDefaults() {
  Chart.defaults.font.family = "Inter, ui-sans-serif, system-ui, sans-serif";
  Chart.defaults.color = "#687675";
  Chart.defaults.plugins.tooltip.backgroundColor = "#121212";
  Chart.defaults.plugins.tooltip.padding = 12;
  Chart.defaults.plugins.tooltip.cornerRadius = 10;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudieron cargar los datos");
  return data;
}

function latestContext() {
  return state.summary.latest;
}

function selectedContext() {
  return {
    year: selectedYear,
    month_index: selectedMonth,
    month: monthNames[selectedMonth - 1],
  };
}

function centers() {
  return state.summary.centers;
}

function yearsFor(metric = "facturacion") {
  return [...new Set(state.metrics.filter(r => r.metric === metric && r.center !== "TOTAL").map(r => r.year))].sort((a, b) => a - b);
}

function availableMonthsForYear(year) {
  return [...new Set(
    state.metrics
      .filter(r => r.metric === "facturacion" && r.year === year && r.center !== "TOTAL")
      .map(r => r.month_index)
  )].sort((a, b) => a - b);
}

function metricValue(metric, year, monthIndex, center = null) {
  return state.metrics
    .filter(r => r.metric === metric && r.year === year && r.month_index === monthIndex && r.center !== "TOTAL" && (!center || r.center === center))
    .reduce((sum, row) => sum + (row.value || 0), 0);
}

function ytdValue(metric, year, throughMonth, center = null) {
  return state.metrics
    .filter(r => r.metric === metric && r.year === year && r.month_index <= throughMonth && r.center !== "TOTAL" && (!center || r.center === center))
    .reduce((sum, row) => sum + (row.value || 0), 0);
}

function deltaPercent(current, previous) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function deltaClass(delta) {
  if (delta === null || Math.abs(delta) < 0.1) return "neutral";
  return delta > 0 ? "positive" : "negative";
}

function deltaText(delta) {
  if (delta === null) return "Sin comparativa";
  return `${percentFmt.format(delta)}% vs año anterior`;
}

function updateSelectedPeriod(year, month) {
  selectedYear = Number(year);
  selectedMonth = Number(month);
}

function fillPeriodControls() {
  const latest = latestContext();
  selectedYear = selectedYear || latest.year;
  selectedMonth = selectedMonth || latest.month_index;

  const yearSelect = document.getElementById("yearSelect");
  const monthSelect = document.getElementById("monthSelect");
  const years = yearsFor("facturacion").reverse();

  yearSelect.innerHTML = years.map(year => `<option value="${year}">${year}</option>`).join("");
  yearSelect.value = selectedYear;

  function fillMonths() {
    const months = availableMonthsForYear(Number(yearSelect.value));
    monthSelect.innerHTML = months.map(month => `<option value="${month}">${monthNames[month - 1]}</option>`).join("");
    if (!months.includes(Number(monthSelect.value))) {
      monthSelect.value = months.includes(selectedMonth) ? selectedMonth : months[months.length - 1];
    }
  }

  monthSelect.value = selectedMonth;
  fillMonths();
  monthSelect.value = selectedMonth;

  yearSelect.onchange = () => {
    const months = availableMonthsForYear(Number(yearSelect.value));
    updateSelectedPeriod(yearSelect.value, months.includes(selectedMonth) ? selectedMonth : months[months.length - 1]);
    fillMonths();
    monthSelect.value = selectedMonth;
    renderDashboardViews();
  };

  monthSelect.onchange = () => {
    updateSelectedPeriod(yearSelect.value, monthSelect.value);
    renderDashboardViews();
  };
}

function renderStatus() {
  const latest = latestContext();
  const selected = selectedContext();
  document.getElementById("latestPeriod").textContent = latest.year ? `${latest.month} ${latest.year}` : "-";
  document.getElementById("comparisonPeriod").textContent = selected.year ? `Enero-${selected.month} ${selected.year}` : "Comparativa anual";
  document.getElementById("refreshedAt").textContent = state.refreshed_at
    ? new Date(state.refreshed_at).toLocaleString("es-ES")
    : "Sin cargar";
}

function renderKpis() {
  const selected = selectedContext();
  const previousYear = selected.year - 1;
  const currentYtd = ytdValue("facturacion", selected.year, selected.month_index);
  const previousYtd = ytdValue("facturacion", previousYear, selected.month_index);
  const selectedRevenue = metricValue("facturacion", selected.year, selected.month_index);
  const previousRevenue = metricValue("facturacion", previousYear, selected.month_index);
  const activeUsers = metricValue("clientes_activos", selected.year, selected.month_index);
  const previousActiveUsers = metricValue("clientes_activos", previousYear, selected.month_index);
  const annualProjection = selected.month_index ? (currentYtd / selected.month_index) * 12 : 0;

  const items = [
    ["Facturacion anual acumulada", euro.format(currentYtd), deltaPercent(currentYtd, previousYtd)],
    [`Facturacion ${selected.month}`, euro.format(selectedRevenue), deltaPercent(selectedRevenue, previousRevenue)],
    [`Usuarios ${selected.month}`, numberFmt.format(activeUsers), deltaPercent(activeUsers, previousActiveUsers)],
    ["Proyeccion anual", euro.format(annualProjection), null],
  ];

  document.getElementById("kpis").innerHTML = items
    .map(([label, value, delta]) => `
      <article class="kpi">
        <span>${label}</span>
        <strong>${value}</strong>
        <em class="delta ${deltaClass(delta)}">${deltaText(delta)}</em>
      </article>
    `)
    .join("");
}

function renderYtdComparisonChart() {
  const selected = selectedContext();
  const years = yearsFor("facturacion").filter(year => year <= selected.year);
  const visibleYears = years.slice(-6);
  const values = visibleYears.map(year => ytdValue("facturacion", year, selected.month_index));

  chart("ytdComparisonChart", {
    type: "bar",
    data: {
      labels: visibleYears,
      datasets: [{
        label: `Facturacion acumulada hasta ${selected.month}`,
        data: values,
        backgroundColor: visibleYears.map((year, index) => year === selected.year ? "#87B15F" : comparisonColors[index % comparisonColors.length]),
        borderRadius: 12,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => euro.format(ctx.raw) } }
      },
      scales: {
        y: { ticks: { callback: value => euro.format(value) }, grid: { color: "rgba(18,18,18,.07)" } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderMonthlyRevenueChart() {
  const selected = selectedContext();
  const labels = monthNames.slice(0, selected.month_index);
  const previousYear = selected.year - 1;
  const datasets = centers().map(center => ({
    type: "bar",
    label: `${center} ${selected.year}`,
    data: labels.map((_, index) => metricValue("facturacion", selected.year, index + 1, center)),
    backgroundColor: centerColors[center] || "#687675",
    borderRadius: 8,
    stack: "current",
  }));

  datasets.push({
    type: "line",
    label: `Total ${previousYear}`,
    data: labels.map((_, index) => metricValue("facturacion", previousYear, index + 1)),
    borderColor: "#6d7776",
    backgroundColor: "#6d7776",
    borderDash: [6, 5],
    pointRadius: 3,
    stack: "previous-year-total",
    tension: 0.25,
  });

  chart("monthlyRevenueChart", {
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${euro.format(ctx.raw || 0)}` } }
      },
      scales: {
        y: { stacked: true, ticks: { callback: value => euro.format(value) }, grid: { color: "rgba(18,18,18,.07)" } },
        x: { stacked: true, grid: { display: false } }
      }
    }
  });
}

function renderMonthlyUsersChart() {
  const selected = selectedContext();
  const labels = monthNames.slice(0, selected.month_index);
  const previousYear = selected.year - 1;

  function hexAlpha(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  const datasets = centers().flatMap(center => {
    const color = centerColors[center] || "#687675";
    return [
      {
        label: `${center} ${selected.year}`,
        data: labels.map((_, index) => metricValue("clientes_activos", selected.year, index + 1, center)),
        backgroundColor: color,
        borderRadius: 4,
      },
      {
        label: `${center} ${previousYear}`,
        data: labels.map((_, index) => metricValue("clientes_activos", previousYear, index + 1, center)),
        backgroundColor: hexAlpha(color, 0.35),
        borderRadius: 4,
      }
    ];
  });

  chart("monthlyUsersChart", {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: {
        y: { grid: { color: "rgba(18,18,18,.07)" } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderCenterComparison() {
  const selected = selectedContext();
  const years = yearsFor("facturacion").filter(year => year <= selected.year).slice(-4);
  const centerList = centers();

  chart("centerComparisonChart", {
    type: "bar",
    data: {
      labels: centerList,
      datasets: years.map((year, index) => ({
        label: `${selected.month} ${year}`,
        data: centerList.map(center => metricValue("facturacion", year, selected.month_index, center)),
        backgroundColor: year === selected.year ? "#87B15F" : comparisonColors[index % comparisonColors.length],
        borderRadius: 8,
      }))
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${euro.format(ctx.raw || 0)}` } }
      },
      scales: {
        y: { ticks: { callback: value => euro.format(value) }, grid: { color: "rgba(18,18,18,.07)" } },
        x: { grid: { display: false } }
      }
    }
  });

  renderMonthlyComparisonTable(years);
}

function renderMonthlyComparisonTable(years) {
  const selected = selectedContext();
  const table = document.getElementById("monthlyComparisonTable");
  table.querySelector("thead").innerHTML = `
    <tr>
      <th>Centro</th>
      ${years.map(year => `<th>Fact. ${year}</th>`).join("")}
      <th>Usuarios ${selected.year}</th>
      <th>Var. fact. vs ${selected.year - 1}</th>
      <th>Var. usuarios vs ${selected.year - 1}</th>
    </tr>
  `;
  table.querySelector("tbody").innerHTML = centers().map(center => {
    const currentRevenue = metricValue("facturacion", selected.year, selected.month_index, center);
    const previousRevenue = metricValue("facturacion", selected.year - 1, selected.month_index, center);
    const currentUsers = metricValue("clientes_activos", selected.year, selected.month_index, center);
    const previousUsers = metricValue("clientes_activos", selected.year - 1, selected.month_index, center);
    const revenueDelta = deltaPercent(currentRevenue, previousRevenue);
    const usersDelta = deltaPercent(currentUsers, previousUsers);

    return `
      <tr>
        <td><strong>${center}</strong></td>
        ${years.map(year => `<td>${euro.format(metricValue("facturacion", year, selected.month_index, center))}</td>`).join("")}
        <td>${numberFmt.format(currentUsers)}</td>
        <td><span class="delta ${deltaClass(revenueDelta)}">${revenueDelta === null ? "-" : `${percentFmt.format(revenueDelta)}%`}</span></td>
        <td><span class="delta ${deltaClass(usersDelta)}">${usersDelta === null ? "-" : `${percentFmt.format(usersDelta)}%`}</span></td>
      </tr>
    `;
  }).join("");
}

function fillCenterSelect() {
  const select = document.getElementById("centerSelect");
  const current = select.value;
  select.innerHTML = centers().map(center => `<option value="${center}">${center}</option>`).join("");
  select.value = current && centers().includes(current) ? current : centers()[0];
  select.onchange = () => renderCenter(select.value);
}

function renderCenter(center) {
  const selected = selectedContext();
  const labels = monthNames.slice(0, selected.month_index);

  chart("centerRevenueChart", {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: `Facturacion ${selected.year}`,
        data: labels.map((_, index) => metricValue("facturacion", selected.year, index + 1, center)),
        backgroundColor: centerColors[center] || "#87B15F",
        borderRadius: 8,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => euro.format(ctx.raw || 0) } }
      },
      scales: {
        y: { ticks: { callback: value => euro.format(value) }, grid: { color: "rgba(18,18,18,.07)" } },
        x: { grid: { display: false } }
      }
    }
  });

  chart("centerActivityChart", {
    data: {
      labels,
      datasets: [
        {
          type: "line",
          label: "Clientes activos",
          data: labels.map((_, index) => metricValue("clientes_activos", selected.year, index + 1, center)),
          borderColor: "#121212",
          backgroundColor: "#121212",
          yAxisID: "users",
          tension: 0.25,
          pointRadius: 3,
        },
        {
          type: "bar",
          label: "Altas",
          data: labels.map((_, index) => metricValue("altas", selected.year, index + 1, center)),
          backgroundColor: "#87B15F",
          yAxisID: "flow",
          borderRadius: 8,
        },
        {
          type: "bar",
          label: "Bajas",
          data: labels.map((_, index) => metricValue("bajas", selected.year, index + 1, center)),
          backgroundColor: "#C4C0BF",
          yAxisID: "flow",
          borderRadius: 8,
        },
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: {
        users: {
          type: "linear",
          position: "left",
          title: { display: true, text: "Usuarios" },
          grid: { color: "rgba(18,18,18,.07)" },
        },
        flow: {
          type: "linear",
          position: "right",
          title: { display: true, text: "Altas / bajas" },
          grid: { drawOnChartArea: false },
        },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderDashboardViews() {
  renderStatus();
  renderKpis();
  renderYtdComparisonChart();
  renderMonthlyRevenueChart();
  renderMonthlyUsersChart();
  renderCenterComparison();
  fillCenterSelect();
  renderCenter(document.getElementById("centerSelect").value);
}

function renderAll() {
  chartDefaults();
  fillPeriodControls();
  renderDashboardViews();
}

async function loadDashboard() {
  state = await fetchJson("/api/dashboard");
  renderAll();
}

document.getElementById("refreshBtn").addEventListener("click", async () => {
  const btn = document.getElementById("refreshBtn");
  btn.disabled = true;
  btn.textContent = "Actualizando...";
  try {
    state = await fetchJson("/api/refresh", { method: "POST" });
    selectedYear = null;
    selectedMonth = null;
    renderAll();
  } finally {
    btn.disabled = false;
    btn.textContent = "Actualizar datos";
  }
});

loadDashboard().catch(error => {
  document.querySelector(".layout").insertAdjacentHTML(
    "afterbegin",
    `<section class="panel"><strong>No se pudieron cargar los datos.</strong><p>${error.message}</p></section>`
  );
});
