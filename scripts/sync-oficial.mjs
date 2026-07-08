// Puxa os 7 CSV publicados pelo Juliano (Publicar na web -> CSV) e consolida o
// TOTAL oficial de cada apostador em oficial.json. O placar le esse arquivo ao
// vivo e ordena o ranking por ele. Rodado pelo GitHub Action de tempos em tempos:
// quando o Juliano mexe na planilha dele, o CSV publicado muda e o nosso segue.
import { writeFileSync, readFileSync } from "node:fs";

// aba -> { url, col do TOTAL por linha, bucket do breakdown }
const SRC = [
  { key: "gru", tot: 19, url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRrPkk6oyerdtyJL2rftSVBFx9kapsTh-Wgu6n2DX1m1OKnhfYOWzd3k-j_k8OIja58HtZBe0L8ft-P/pub?gid=1652979763&single=true&output=csv" }, // placar grupos
  { key: "gru", tot: 17, url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRxSE4KfAYPVm3LOfHPbt_zHLDdIkarkuatwsCCqxIP4raYiwFUJG5FLhXU3_5HXXch5QAt_bbruV8V/pub?gid=1239433766&single=true&output=csv" }, // classif grupos
  { key: "bc",  tot: 14, url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRQf_V25XGrceSqu0ETDlnJVZA-9NPT7WoJ5mxm2b81bj09QWUvZfjRiJUUxQRUB9HNRFkC9nTaANsj/pub?gid=201491886&single=true&output=csv" },  // bola de cristal
  { key: "r16", tot: 21, ko: true, roc: 10, url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTPonnWkbjUABjLEWuKMKxCLnk0aAFjH4TxCD1bMFuLEAxnh4bKtmqOGu_gYwAYaFSclWh32e86GQzw/pub?gid=470405565&single=true&output=csv" },   // palpites 16avos (Soma)
  { key: "r16", tot: 7,  url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQfF9vgNT43fYsj8aXA1W1R20EyxiVvFVazfJ1TdFFkHBTd24jLh6em_RXUtIDy8wcU5yKzSOIqLIPP/pub?gid=1998262955&single=true&output=csv" }, // perguntas 16avos
  { key: "oit", tot: 21, ko: true, roc: 10, url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTpVEon_DDG_YDxKLcdTME2J2YDtUS4UWTsDIZTNsyyuYtrr2bWlVv73pyfqZiEuqfWIVWIOuJSPZ7G/pub?gid=409015852&single=true&output=csv" },   // palpites oitavas (Soma)
  { key: "oit", tot: 8,  url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vR9NSZtXT7yZOE41nOqSUE9iklIH7WkbFeb5EdRFKDEt3uVCmEnTof0ND_mb5UXfoKqjnSpo2tieiL3/pub?gid=837919751&single=true&output=csv" },  // perguntas oitavas
  { key: "qua", tot: 22, ko: true, roc: 11, url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRVuU9I0zWku5rMqD5gShxY5rJMFM3pUHCBsxpTHPUBI-UPs8L83lnha8XrrwS8hKZD3mZ8NBxpOjcv/pub?gid=1836479796&single=true&output=csv" },   // palpites quartas (Soma, coluna deslocada)
];
const NAME_COL = 1;      // coluna do apostador em todas as abas
const HEADERS = new Set(["nome", "nome apostador", "apostador", "grupo", "id", ""]);

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
const numOf = (s) => { const n = parseFloat((s || "").trim().replace(",", ".")); return Number.isFinite(n) ? n : 0; };

async function fetchCsv(url) {
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url.slice(0, 60)}`);
  return parseCSV(await r.text());
}

const A = {}; // nome -> { total, gru, bc, r16, oit }
function add(name, bucket, val) {
  const n = norm(name);
  if (!n || HEADERS.has(n.toLowerCase())) return;
  const a = (A[n] ||= { total: 0, gru: 0, bc: 0, r16: 0, oit: 0, qua: 0 });
  a[bucket] += val; a.total += val;
}

const settled = new Set(); // nº dos jogos de mata-mata que o Juliano JA lancou
let ok = 0;
for (const s of SRC) {
  try {
    const rows = await fetchCsv(s.url);
    for (const r of rows.slice(4)) {           // pula bloco de titulo/cabecalho
      if (r.length <= s.tot) continue;
      add(r[NAME_COL], s.key, numOf(r[s.tot]));
      if (s.ko && r.length > 10) {             // jogo "lancado" = Resultado Oficial (col 10) real
        const m = /^\s*0*(\d+)/.exec(r[0] || "");
        const rf = (r[s.roc] || "").trim();    // Resultado Oficial (col varia por fase); ignora vazio/erros (#N/A)
        if (m && rf && !rf.startsWith("#")) settled.add(+m[1]);
      }
    }
    ok++;
  } catch (e) { console.error("FALHA numa aba:", e.message); }
}

const names = Object.keys(A);
if (ok < SRC.length || names.length < 40) {
  // rede falhou/parcial: NAO sobrescreve o bom com lixo
  console.error(`Abortado: abas ok=${ok}/${SRC.length}, apostadores=${names.length}. oficial.json mantido.`);
  process.exit(0);
}
for (const n of names) for (const k of ["total", "gru", "bc", "r16", "oit", "qua"]) A[n][k] = Math.round(A[n][k]);

const out = { atualizado: new Date().toISOString(), n: names.length, settled: [...settled].sort((a, b) => a - b), apostadores: A };
const prev = (() => { try { return readFileSync("oficial.json", "utf8"); } catch { return ""; } })();
const next = JSON.stringify(out, null, 0);
// compara ignorando o timestamp, pra so commitar quando pontuacao muda
const strip = (s) => s.replace(/"atualizado":"[^"]*",/, "");
if (strip(prev) === strip(next)) { console.log("Sem mudanca de pontos."); process.exit(0); }
writeFileSync("oficial.json", next);
const top = names.map((n) => [n, A[n].total]).sort((a, b) => b[1] - a[1]).slice(0, 3);
console.log(`oficial.json atualizado: ${names.length} apostadores. Top:`, top);
