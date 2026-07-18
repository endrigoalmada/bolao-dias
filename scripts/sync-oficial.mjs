// Lê o TOTAL oficial de cada apostador DIRETO da aba Classificação publicada pelo
// Juliano (fonte da verdade), e escreve oficial.json. O placar usa esse total no
// ranking. Também lê as abas de palpites do mata-mata SÓ pra saber quais jogos ele
// já lançou (settled) -> o live-delta usa isso. Rodado pelo GitHub Action.
import { writeFileSync, readFileSync } from "node:fs";

// FONTE DA VERDADE: total oficial por apostador (Nome col2, TOTAL col3)
const CLASSIF_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRcx-P46yptdm6jpQGlokhXjx0NuWWs9Wps0LLNTsbQ2ejVO_4JEmZ5NxAJSpkGYrrK7jLp-aIiOwQ5/pub?gid=2143972406&single=true&output=csv";

// abas de palpites do mata-mata: SÓ pra detectar quais jogos já foram lançados (col do Resultado Oficial varia)
const KO = [
  { roc: 10, url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTPonnWkbjUABjLEWuKMKxCLnk0aAFjH4TxCD1bMFuLEAxnh4bKtmqOGu_gYwAYaFSclWh32e86GQzw/pub?gid=470405565&single=true&output=csv" }, // 16avos
  { roc: 10, url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTpVEon_DDG_YDxKLcdTME2J2YDtUS4UWTsDIZTNsyyuYtrr2bWlVv73pyfqZiEuqfWIVWIOuJSPZ7G/pub?gid=409015852&single=true&output=csv" }, // oitavas
  { roc: 11, url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRVuU9I0zWku5rMqD5gShxY5rJMFM3pUHCBsxpTHPUBI-UPs8L83lnha8XrrwS8hKZD3mZ8NBxpOjcv/pub?gid=1836479796&single=true&output=csv" }, // quartas
  { roc: 10, url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQgSB9Fyhr2nED4-v_5cuB4mx_xTdQHW7Pw85AYFVK0SJHycENVy21MGM0uoSJtia5zkoovhd5U3Xg-/pub?gid=1583806495&single=true&output=csv" }, // semi
  { roc: 13, url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ-FzKYl6pSpJ69EHXa2feB0FBaodEqspHmLhC6jAr3IZl4AKAHI20pJjO6WMQTyHYkt2upm4QO-RdT/pub?gid=2013029975&single=true&output=csv" }, // 3x4 + final
];

// CSV parser RFC4180 (aspas, virgulas e quebras dentro de campo)
function parseCSV(txt) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) {
      if (c === '"') { if (txt[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
const norm = (s) => (s || "").replace(/⁠|﻿/g, "").trim().replace(/^\?/, "").trim();
async function fetchCsv(url) {
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return parseCSV(await r.text());
}

// 1) TOTAIS OFICIAIS (fonte da verdade)
let cls;
try { cls = await fetchCsv(CLASSIF_URL); }
catch (e) { console.error("Classificacao falhou:", e.message, "-> oficial.json mantido."); process.exit(0); }
const A = {};
for (const r of cls) {
  if (r.length < 4) continue;
  const nome = norm(r[2]);
  const tot = (r[3] || "").trim();
  if (!nome || nome.toLowerCase() === "nome apostador" || !/^\d+$/.test(tot)) continue;
  A[nome] = { total: parseInt(tot, 10) };
}
const names = Object.keys(A);
if (names.length < 40) { console.error(`Abortado: so ${names.length} apostadores na Classificacao (parcial?). oficial.json mantido.`); process.exit(0); }

// 2) SETTLED: quais jogos de mata-mata o Juliano ja lancou (Resultado Oficial real)
const settled = new Set();
let koOk = 0;
for (const s of KO) {
  try {
    const rows = await fetchCsv(s.url);
    for (const r of rows.slice(4)) {
      if (r.length <= s.roc) continue;
      const m = /^\s*0*(\d+)/.exec(r[0] || "");
      const rf = (r[s.roc] || "").trim();
      if (m && rf && !rf.startsWith("#")) settled.add(+m[1]);
    }
    koOk++;
  } catch (e) { console.error("KO aba falhou:", e.message); }
}

const out = { atualizado: new Date().toISOString(), n: names.length, settled: [...settled].sort((a, b) => a - b), apostadores: A };
const prev = (() => { try { return readFileSync("oficial.json", "utf8"); } catch { return ""; } })();
const next = JSON.stringify(out, null, 0);
const strip = (s) => s.replace(/"atualizado":"[^"]*",/, "");
if (strip(prev) === strip(next)) { console.log("Sem mudanca."); process.exit(0); }
writeFileSync("oficial.json", next);
const top = names.map((n) => [n, A[n].total]).sort((a, b) => b[1] - a[1]).slice(0, 3);
console.log(`oficial.json (total OFICIAL direto da Classificacao): ${names.length} apostadores, settled=${settled.size}. Top:`, top);
