import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import fse from "fs-extra";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Static frontend
app.use(express.static(path.join(__dirname, "public")));

// Utility to read JSON safely
function readJSON(p, fallback={}){
  try{
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  }catch(e){
    return fallback;
  }
}

// API: health
app.get("/api/health", (req,res)=> res.json({ ok:true }));

// API: summaries (pre-aggregated)
app.get("/api/summary", (req,res)=>{
  const p = path.join(__dirname, "outputs", "summary.json");
  res.json(readJSON(p, {error:"summary.json não encontrado. Rode `npm run build:preagg`."}));
});

app.get("/api/by-airport", (req,res)=>{
  const p = path.join(__dirname, "outputs", "by_airport.json");
  res.json(readJSON(p, {}));
});

app.get("/api/trend", (req,res)=>{
  const p = path.join(__dirname, "outputs", "trend_by_year.json");
  res.json(readJSON(p, {}));
});

app.get("/api/dow", (req,res)=>{
  const p = path.join(__dirname, "outputs", "dow_by_year.json");
  res.json(readJSON(p, {}));
});

app.get("/api/period", (req,res)=>{
  const p = path.join(__dirname, "outputs", "period_by_year.json");
  res.json(readJSON(p, {}));
});

app.get("/api/airline", (req,res)=>{
  const p = path.join(__dirname, "outputs", "airline_by_year.json");
  res.json(readJSON(p, {}));
});

// Download a sample CSV processed (optional)
app.get("/api/sample.csv", (req,res)=>{
  const p = path.join(__dirname, "outputs", "processed_sample_month.csv");
  if (fs.existsSync(p)) res.sendFile(p);
  else res.status(404).json({error:"processed_sample_month.csv não encontrado"});
});

app.listen(PORT, ()=>{
  console.log("Server running on http://localhost:"+PORT);
});
