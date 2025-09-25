// Funções utilitárias
function setKPI(id, value) {
  document.getElementById(id).textContent = value;
}

function pct(n) {
  return (n * 100).toFixed(1) + "%";
}

function tableAirports(rows) {
  const tbody = document.querySelector("#tbl-airports tbody");
  tbody.innerHTML = "";
  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.airport}</td>
      <td>${r.delayed}</td>
      <td>${r.total}</td>
      <td>${pct(r.rate)}</td>`;
    tbody.appendChild(tr);
  });
}

function chartTrend(ctx, trend) {
  const years = Object.keys(trend).sort();
  const delayed = years.map(y => trend[y].delayed || 0);
  const total = years.map(y => trend[y].total || 0);
  new Chart(ctx, {
    type: "line",
    data: {
      labels: years,
      datasets: [
        { label: "Atrasados", data: delayed, borderColor: "#e74c3c", fill: false },
        { label: "Totais", data: total, borderColor: "#3498db", fill: false }
      ]
    },
    options: { responsive: true }
  });
}

function chartStacked(ctx, dataByYear, labeler) {
  const years = Object.keys(dataByYear).sort();
  const cats = Array.from(new Set(years.flatMap(y => Object.keys(dataByYear[y])))).sort();
  const datasets = cats.map(cat => ({
    label: labeler(cat),
    data: years.map(y => (dataByYear[y][cat]?.delayed) || 0),
    stack: "stack"
  }));
  new Chart(ctx, {
    type: "bar",
    data: { labels: years, datasets },
    options: { 
      responsive: true, 
      scales: { 
        x: { stacked: true }, 
        y: { stacked: true } 
      } 
    }
  });
}

// Programa principal
(async function main() {
  const summary = await fetchJSON("/api/summary");
  if (summary.error) {
    alert(summary.error);
    return;
  }

  // KPIs
  const total = Object.values(summary.trend_by_year).reduce((a,b)=> a + (b.total||0), 0);
  const delayed = Object.values(summary.trend_by_year).reduce((a,b)=> a + (b.delayed||0), 0);
  setKPI("kpi-total", total.toLocaleString("pt-BR"));
  setKPI("kpi-delayed", delayed.toLocaleString("pt-BR"));
  setKPI("kpi-rate", (delayed/Math.max(total,1)).toLocaleString("pt-BR", {style:"percent", minimumFractionDigits:1}));

  // Aeroporto com mais atrasos
  if (summary.top_airports_by_delays.length > 0) {
    const top = summary.top_airports_by_delays[0];
    document.getElementById("highlight-airport").textContent =
      `${top.airport} (${top.name||"—"}, ${top.muni||"—"}) com ${top.delayed} atrasos`;
  }

  // Tabela aeroportos
  tableAirports(summary.top_airports_by_delays);

  // Tendência
  const trend = await fetchJSON("/api/trend");
  chartTrend(document.getElementById("chart-trend"), trend);
  const years = Object.keys(trend).sort();
  if (years.length >= 2) {
    const first = trend[years[0]].delayed;
    const last = trend[years[years.length-1]].delayed;
    document.getElementById("trend-analysis").textContent =
      last > first ? "📈 Os atrasos aumentaram no período." :
      last < first ? "📉 Os atrasos diminuíram no período." :
      "➖ Os atrasos se mantiveram estáveis.";
  }

  // Dias da semana
  const dow = await fetchJSON("/api/dow");
  const dowNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  chartStacked(document.getElementById("chart-dow"), dow, (d)=> dowNames[+d] || d);

  // Períodos do dia
  const period = await fetchJSON("/api/period");
  chartStacked(document.getElementById("chart-period"), period, (p)=> p);

  // Companhias
  const airline = await fetchJSON("/api/airline");
  const airlineTop = {};
  for (const [year, map] of Object.entries(airline)) {
    const arr = Object.entries(map).map(([k,v])=>({k,delayed:v.delayed||0}))
      .sort((a,b)=>b.delayed-a.delayed).slice(0,8);
    airlineTop[year] = Object.fromEntries(arr.map(o=>[o.k, airline[year][o.k]]));
  }
  chartStacked(document.getElementById("chart-airline"), airlineTop, (a)=> a);
})();
