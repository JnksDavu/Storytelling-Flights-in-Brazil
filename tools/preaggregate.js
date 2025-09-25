import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse";
import fse from "fs-extra";
import dayjs from "dayjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.join(__dirname, "..");
const DATASET_DIR = path.join(ROOT, "Dataset");
const OUTPUT_DIR = path.join(ROOT, "outputs");
const AUX_CODES_PATH = path.join(ROOT, "Dataset", "airport-codes.csv");

const MIN_DELAY_MIN = 15;
const PERIODS = [
  { name: "Madrugada", start: 0, end: 6 },
  { name: "Manhã", start: 6, end: 12 },
  { name: "Tarde", start: 12, end: 18 },
  { name: "Noite", start: 18, end: 24 },
];

function normStr(s) {
  return (s ?? "").toString().trim();
}
function parseBRDateTime(s) {
  s = normStr(s);
  if (!s) return null;
  const [dpart, tpart] = s.split(" ");
  if (!dpart) return null;
  const [dd, mm, yyyy] = dpart.split("/").map((x) => parseInt(x, 10));
  let hh = 0, mi = 0;
  if (tpart) {
    const [h, m] = tpart.split(":").map((x) => parseInt(x, 10));
    hh = h || 0; mi = m || 0;
  }
  const dt = dayjs(new Date(yyyy, mm - 1, dd, hh, mi));
  return dt.isValid() ? dt : null;
}
function minutesDiff(a, b) {
  if (!a || !b) return null;
  return Math.round((a.toDate() - b.toDate()) / 60000);
}
function get(rec, ...keys) {
  for (const k of keys) {
    if (rec[k] !== undefined && rec[k] !== "") return rec[k];
  }
  return "";
}

// ---------- Carregar nomes auxiliares ----------
async function loadAirportNames() {
  const map = new Map();
  if (!fs.existsSync(AUX_CODES_PATH)) return map;
  console.log("Carregando airport-codes.csv");
  const csv = fs.readFileSync(AUX_CODES_PATH, "utf-8");
  const rows = csv.split(/\r?\n/).slice(1);
  for (const line of rows) {
    if (!line) continue;
    const parts = line.split(",");
    const icao = parts[9] || "";
    const name = parts[2] || "";
    const muni = parts[8] || "";
    const iso_country = parts[6] || "";
    if (icao && iso_country === "BR") {
      map.set(icao.replace('"', "").trim(), { name, muni });
    }
  }
  return map;
}
const airportMeta = await loadAirportNames();

// ---------- Principal ----------
async function preaggregate() {
  fse.ensureDirSync(OUTPUT_DIR);

  // Só pegar arquivos VRA, ignorar airport-codes.csv
  const files = fs
    .readdirSync(DATASET_DIR)
    .filter(f => /\.csv$/i.test(f) && !/airport-codes/i.test(f) && !/processed/i.test(f));

  if (files.length === 0) {
    console.log("Nenhum CSV VRA encontrado em Dataset/.");
    return;
  }

  const byAirport = new Map();
  const trendByYear = new Map();
  const dowByYear = new Map();
  const periodByYear = new Map();
  const airlineByYear = new Map();

  function bump(container, ...path) {
    let node = container;
    for (let i = 0; i < path.length; i++) {
      const key = path[i];
      if (i === path.length - 1) {
        const cur = node.get(key) || { total: 0, delayed: 0 };
        node.set(key, cur);
        return cur;
      } else {
        const nxt = node.get(key) || new Map();
        node.set(key, nxt);
        node = nxt;
      }
    }
  }
  function inc(mapNode, delayed) {
    mapNode.total += 1;
    if (delayed) mapNode.delayed += 1;
  }

  for (const file of files) {
    const full = path.join(DATASET_DIR, file);
    console.log(">> Lendo", file);

    await new Promise((resolve, reject) => {
      const parser = fs.createReadStream(full, { encoding: "latin1" })
        .pipe(parse({ delimiter: ";", quote: '"', relax_quotes: true, relax_column_count: true }));

      let rowIndex = -3; // -3: Atualizado em, -2: linha vazia, -1: header real
      let header = [];
      parser.on("data", (row) => {
        rowIndex++;
        if (rowIndex === -1) {
          header = row.map(h => h.replace("ï»¿", "").trim());
          console.log("Header detectado:", header);
          return;
        }
        if (rowIndex < 0) return; // ignora metadados

        const rec = Object.fromEntries(header.map((h, i) => [h, row[i]]));
        if (rowIndex < 5) console.log("Linha exemplo", rowIndex, rec);

        const cia = normStr(get(rec, "ICAO Empresa Aérea", "ICAO Empresa AÃ©rea"));
        const origem = normStr(get(rec, "ICAO Aeródromo Origem", "ICAO AerÃ³dromo Origem"));
        const destino = normStr(get(rec, "ICAO Aeródromo Destino", "ICAO AerÃ³dromo Destino"));
        const partidaPrev = parseBRDateTime(get(rec, "Partida Prevista"));
        const partidaReal = parseBRDateTime(get(rec, "Partida Real"));
        const chegadaPrev = parseBRDateTime(get(rec, "Chegada Prevista"));
        const chegadaReal = parseBRDateTime(get(rec, "Chegada Real"));
        const situacao = normStr(get(rec, "Situação Voo", "SituaÃ§Ã£o Voo"));

        const ano = (partidaPrev || chegadaPrev || partidaReal || chegadaReal)?.year();
        if (!ano) return;

        const depDelay = minutesDiff(partidaReal, partidaPrev);
        const arrDelay = minutesDiff(chegadaReal, chegadaPrev);
        const effectiveDelay = arrDelay ?? depDelay ?? 0;
        const isDelayed =
          (typeof effectiveDelay === "number" && effectiveDelay >= MIN_DELAY_MIN) ||
          situacao === "ATRASADO";

        const hh = (partidaPrev || chegadaPrev)?.hour() ?? 0;
        const period = PERIODS.find(p => hh >= p.start && hh < p.end)?.name || "N/D";

        inc(bump(trendByYear, ano), isDelayed);
        inc(bump(dowByYear, ano, (partidaPrev || chegadaPrev)?.day() ?? 0), isDelayed);
        inc(bump(periodByYear, ano, period), isDelayed);
        inc(bump(airlineByYear, ano, cia || "N/D"), isDelayed);
        inc(bump(byAirport, origem || "N/D"), isDelayed);
      });

      parser.on("end", () => {
        console.log("Fim de", file, "- linhas lidas:", rowIndex);
        resolve();
      });
      parser.on("error", reject);
    });
  }

  function mapToObj(m) {
    if (!(m instanceof Map)) return m;
    const obj = {};
    for (const [k, v] of m) obj[k] = mapToObj(v);
    return obj;
  }

  const byAirportObj = mapToObj(byAirport);
  const trendObj = mapToObj(trendByYear);
  const dowObj = mapToObj(dowByYear);
  const periodObj = mapToObj(periodByYear);
  const airlineObj = mapToObj(airlineByYear);

  const airportRank = Object.entries(byAirportObj)
    .map(([a, vals]) => ({
      airport: a,
      delayed: vals.delayed || 0,
      total: vals.total || 0,
      rate: vals.total ? vals.delayed / vals.total : 0,
      name: airportMeta.get(a)?.name || "",
      muni: airportMeta.get(a)?.muni || ""
    }))
    .sort((x, y) => y.delayed - x.delayed)
    .slice(0, 20);

  const summary = {
    generated_at: new Date().toISOString(),
    min_delay_minutes: MIN_DELAY_MIN,
    top_airports_by_delays: airportRank,
    trend_by_year: trendObj,
  };

  fse.writeJsonSync(path.join(OUTPUT_DIR, "by_airport.json"), byAirportObj, { spaces: 2 });
  fse.writeJsonSync(path.join(OUTPUT_DIR, "trend_by_year.json"), trendObj, { spaces: 2 });
  fse.writeJsonSync(path.join(OUTPUT_DIR, "dow_by_year.json"), dowObj, { spaces: 2 });
  fse.writeJsonSync(path.join(OUTPUT_DIR, "period_by_year.json"), periodObj, { spaces: 2 });
  fse.writeJsonSync(path.join(OUTPUT_DIR, "airline_by_year.json"), airlineObj, { spaces: 2 });
  fse.writeJsonSync(path.join(OUTPUT_DIR, "summary.json"), summary, { spaces: 2 });

  console.log("✅ Arquivos gerados em outputs/.");
}

preaggregate().catch(err => {
  console.error(err);
  process.exit(1);
});
