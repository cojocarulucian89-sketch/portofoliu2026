// --- constante: chei localStorage + URL-uri autoload -----------------------

const LS_PORTF = "portfolio_data_v1";
const LS_WATCH = "watchlist_data_v1";
const LS_REV   = "revolut_tx_v1";

const AUTOLOAD_PORTF_URL = "./data/Portfolio_Plan_12_Months_Extended.csv";
const AUTOLOAD_WATCH_URL = "./data/Watchlist_Complementary_Companies.csv";

// --- state ---------------------------------------------------------------

let portfolio = [];
let watchlist = [];
let revolutTx = [];

// --- utilitare simple ----------------------------------------------------

const $ = (id) => document.getElementById(id);

const num = (v) => {
  if (v === null || v === undefined) return 0;
  const s = String(v).replaceAll(",", ".").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

function setStatus(msg) {
  const el = $("status");
  if (el) el.textContent = msg;
}

// citește CSV remote (pentru autoload din data/)
async function autoloadCsv(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  const text = await res.text();
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  return parsed.data || [];
}

// citește fișier din <input> (CSV sau XLSX)
function parseFile(file, onDone) {
  const ext = file.name.toLowerCase().split(".").pop();

  if (ext === "csv") {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => onDone(res.data || []),
      error: (err) => setStatus("Eroare CSV: " + err)
    });
    return;
  }

  if (ext === "xlsx") {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
      onDone(json);
    };
    reader.readAsArrayBuffer(file);
    return;
  }

  setStatus("Format neacceptat: " + ext);
}

// --- localStorage --------------------------------------------------------

function saveLocal() {
  localStorage.setItem(LS_PORTF, JSON.stringify(portfolio));
  localStorage.setItem(LS_WATCH, JSON.stringify(watchlist));
  localStorage.setItem(LS_REV,   JSON.stringify(revolutTx));
}

async function restoreLocal() {
  portfolio = JSON.parse(localStorage.getItem(LS_PORTF) || "[]");
  watchlist = JSON.parse(localStorage.getItem(LS_WATCH) || "[]");
  revolutTx = JSON.parse(localStorage.getItem(LS_REV)   || "[]");

  // dacă nu avem portofoliu salvat local, încercăm să-l luăm din /data
  if (!portfolio.length) {
    try {
      const data = await autoloadCsv(AUTOLOAD_PORTF_URL);
      if (data.length) {
        portfolio = data;
        setStatus("Autoload portofoliu din /data (" + data.length + " rânduri).");
      }
    } catch (e) {
      console.log("Autoload portofoliu eșuat:", e);
    }
  } else {
    setStatus("Restored portofoliu din localStorage.");
  }

  // dacă nu avem watchlist salvat, încercăm autoload
  if (!watchlist.length) {
    try {
      const data = await autoloadCsv(AUTOLOAD_WATCH_URL);
      if (data.length) {
        watchlist = data;
      }
    } catch (e) {
      console.log("Autoload watchlist eșuat:", e);
    }
  }

  if (portfolio.length) {
    refreshAll();
  }
  if (watchlist.length) renderWatchlist();
  if (revolutTx.length) {
    $("revStatus").textContent =
      "Restored Revolut: " + revolutTx.length + " tranzacții.";
    drawRevolutCharts();
  }
}

function clearLocal() {
  localStorage.removeItem(LS_PORTF);
  localStorage.removeItem(LS_WATCH);
  localStorage.removeItem(LS_REV);
  portfolio = [];
  watchlist = [];
  revolutTx = [];
  const watchEl = $("watchTable");
  if (watchEl) watchEl.innerHTML = "Încarcă fișierul watchlist.";
  $("revStatus").textContent = "Revolut CSV neîncărcat încă.";
  setStatus("Curățat. Reîncarcă fișierele.");
}

// --- KPI & grafice pentru portofoliu -------------------------------------

function groupSum(rows, groupKey, valueKey) {
  const map = new Map();
  rows.forEach(r => {
    const k = r[groupKey] ?? "NA";
    const v = num(r[valueKey]);
    map.set(k, (map.get(k) || 0) + v);
  });
  return [...map.entries()].map(([k, v]) => ({ k, v }));
}

function updateKPIs() {
  const totalValue = portfolio.reduce((s, r) => s + num(r.Current_Value_EUR), 0);
  const totalDiv   = portfolio.reduce((s, r) => s + num(r.Total_Dividend_2026_EUR), 0);
  const yieldPct   = totalValue > 0 ? (totalDiv / totalValue * 100) : 0;

  $("kpiValue").textContent = totalValue.toFixed(2) + " EUR";
  $("kpiDiv").textContent   = totalDiv.toFixed(2)   + " EUR";
  $("kpiYield").textContent = yieldPct.toFixed(2)   + "%";
}

function drawBucketChart() {
  const g = groupSum(portfolio, "Bucket", "Current_Value_EUR");
  Plotly.newPlot("bucketChart", [{
    type: "pie",
    labels: g.map(x => x.k),
    values: g.map(x => x.v),
    textinfo: "percent+label",
    hovertemplate: "%{label}<br>%{value:.2f} EUR<extra></extra>"
  }], {
    margin: {t: 10, l: 10, r: 10, b: 10},
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: {color: "#e7eef7"},
    legend: {orientation: "h"}
  });
}

function drawTopChart() {
  const top = [...portfolio]
    .sort((a,b) => num(b.Current_Value_EUR) - num(a.Current_Value_EUR))
    .slice(0, 10);

  Plotly.newPlot("topChart", [{
    type: "bar",
    x: top.map(r => r.Ticker),
    y: top.map(r => num(r.Current_Value_EUR)),
    hovertemplate: "%{x}<br>%{y:.2f} EUR<extra></extra>"
  }], {
    margin: {t: 10},
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: {color: "#e7eef7"},
    xaxis: {title: "Ticker"},
    yaxis: {title: "Valoare (EUR)"}
  });
}

function drawSignalChart() {
  const g = groupSum(portfolio, "Buy_Signal", "Current_Value_EUR");
  Plotly.newPlot("signalChart", [{
    type: "bar",
    x: g.map(x => x.k),
    y: g.map(x => x.v),
    hovertemplate: "%{x}<br>%{y:.2f} EUR<extra></extra>"
  }], {
    margin: {t: 10},
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: {color: "#e7eef7"},
    xaxis: {title: "Semnal"},
    yaxis: {title: "Valoare (EUR)"}
  });
}

function simulate12m() {
  if (!portfolio.length) return;

  const monthly   = num($("monthly").value);
  const rAnnual   = num($("annualReturn").value) / 100;
  const reinvest  = $("reinvest").value === "yes";

  const startValue = portfolio.reduce((s, r) => s + num(r.Current_Value_EUR), 0);
  const div2026    = portfolio.reduce((s, r) => s + num(r.Total_Dividend_2026_EUR), 0);
  const divMonthly = reinvest ? (div2026 / 12) : 0;

  const rMonthly = Math.pow(1 + rAnnual, 1/12) - 1;

  let val = startValue;
  const x = [];
  const y = [];

  for (let m = 0; m <= 12; m++) {
    x.push("M" + m);
    y.push(val);
    val = val * (1 + rMonthly) + monthly + divMonthly;
  }

  Plotly.newPlot("simChart", [{
    type: "scatter",
    mode: "lines+markers",
    x, y,
    fill: "tozeroy",
    hovertemplate: "%{x}<br>%{y:.0f} EUR<extra></extra>"
  }], {
    margin: {t: 10},
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: {color: "#e7eef7"},
    xaxis: {title: "Luni"},
    yaxis: {title: "Valoare (EUR)"}
  });
}

function renderWatchlist() {
  if (!watchlist.length) return;
  const rows = watchlist.slice(0, 40);
  let html = `<table>
    <thead><tr>
      <th>Ticker</th><th>Company</th><th>Region</th><th>Sector</th><th>Yield%</th><th>Priority</th>
    </tr></thead><tbody>`;

  rows.forEach(r => {
    html += `<tr>
      <td>${r.Ticker ?? ""}</td>
      <td>${r.Company ?? ""}</td>
      <td>${r.Region ?? ""}</td>
      <td>${r.Sector ?? ""}</td>
      <td>${num(r.Dividend_Yield_%).toFixed(1)}</td>
      <td>${r.Priority_to_Add ?? ""}</td>
    </tr>`;
  });

  html += "</tbody></table>";
  $("watchTable").innerHTML = html;
}

// --- grafice din CSV Revolut ---------------------------------------------

function drawRevolutCharts() {
  if (!revolutTx.length) return;

  // cash flow pe luni (top-up + withdrawal)
  const byMonth = new Map();
  revolutTx.forEach(r => {
    const type = r.Type || "";
    const tot  = (r["Total Amount"] || "").replace("EUR","").replace("USD","").trim();
    const amount = num(tot);
    const date = (r.Date || "").slice(0,7); // YYYY-MM

    if (!byMonth.has(date)) byMonth.set(date, 0);
    if (type.includes("CASH TOP-UP") || type.includes("CASH WITHDRAWAL")) {
      byMonth.set(date, byMonth.get(date) + amount);
    }
  });

  const months = [...byMonth.keys()].sort();
  const values = months.map(m => byMonth.get(m));

  Plotly.newPlot("cashFlowChart", [{
    type: "bar",
    x: months,
    y: values,
    hovertemplate: "%{x}<br>%{y:.2f} cash net<extra></extra>"
  }], {
    margin: {t: 10},
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: {color: "#e7eef7"},
    xaxis: {title: "Lună"},
    yaxis: {title: "Cash net"}
  });

  // dividende total per ticker (life-time)
  const divMap = new Map();
  revolutTx.forEach(r => {
    const type = r.Type || "";
    if (!type.includes("DIVIDEND")) return;
    const ticker = r.Ticker || "NA";
    const tot    = (r["Total Amount"] || "").replace("EUR","").replace("USD","").trim();
    const amount = num(tot);
    divMap.set(ticker, (divMap.get(ticker) || 0) + amount);
  });

  const divData = [...divMap.entries()]
    .sort((a,b) => b[1] - a[1])
    .slice(0, 10);

  Plotly.newPlot("divByTickerChart", [{
    type: "bar",
    x: divData.map(x => x[0]),
    y: divData.map(x => x[1]),
    hovertemplate: "%{x}<br>%{y:.2f} dividende<extra></extra>"
  }], {
    margin: {t: 10},
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: {color: "#e7eef7"},
    xaxis: {title: "Ticker"},
    yaxis: {title: "Dividende totale"}
  });
}

// --- event handlers ------------------------------------------------------

$("filePortfolio").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  setStatus("Se încarcă portofoliul: " + file.name);
  parseFile(file, (rows) => {
    portfolio = rows;
    setStatus("Portofoliu încărcat: " + rows.length + " rânduri. Salvat local.");
    refreshAll();
  });
});

$("fileWatchlist").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  setStatus("Se încarcă watchlist: " + file.name);
  parseFile(file, (rows) => {
    watchlist = rows;
    renderWatchlist();
    saveLocal();
    setStatus("Watchlist încărcat: " + rows.length + " rânduri. Salvat local.");
  });
});

$("fileRevolut").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  $("revStatus").textContent = "Se încarcă Revolut: " + file.name;

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: (res) => {
      revolutTx = res.data || [];
      $("revStatus").textContent =
        "Revolut: " + revolutTx.length + " tranzacții încărcate. Salvat local.";
      saveLocal();
      drawRevolutCharts();
    }
  });
});

$("btnRestore").addEventListener("click", () => { restoreLocal(); });
$("btnClear").addEventListener("click", () => { clearLocal(); });

["monthly","annualReturn","reinvest"].forEach(id => {
  $(id).addEventListener("input", simulate12m);
  $(id).addEventListener("change", simulate12m);
});

// --- init ----------------------------------------------------------------

window.addEventListener("load", () => {
  restoreLocal();
});

function refreshAll() {
  if (!portfolio.length) return;
  updateKPIs();
  drawBucketChart();
  drawTopChart();
  drawSignalChart();
  simulate12m();
  saveLocal();
}
