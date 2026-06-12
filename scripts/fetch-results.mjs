// Robo do Placar Bolao do Dias: busca resultados ENCERRADOS na API publica da
// ESPN e atualiza resultados.json. Sem chave, sem dependencias (Node 20 fetch).
// Respeita correcoes manuais em resultados_manuais.json (manual sempre vence).
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=";

const norm = (s) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// variantes de nome da ESPN -> nome canonico (ingles) usado nos fixtures
const ALIAS = {
  czechia: "Czech Republic", usa: "United States", unitedstates: "United States",
  korearepublic: "South Korea", iriran: "Iran", turkiye: "Turkey",
  cotedivoire: "Ivory Coast", ivorycoast: "Ivory Coast", caboverde: "Cape Verde",
  congodr: "DR Congo", drcongo: "DR Congo", curacao: "Curaçao",
  bosniaherzegovina: "Bosnia and Herzegovina", bosniaandherzegovina: "Bosnia and Herzegovina",
};

const fixtures = JSON.parse(readFileSync("fixtures.json", "utf-8"));

// mapa normalizado dos nomes canonicos + indice de par (jogo) -> fixture
const canonMap = {};
const pairIndex = {};
for (const fx of fixtures) {
  canonMap[norm(fx.home)] = fx.home;
  canonMap[norm(fx.away)] = fx.away;
  pairIndex[[fx.home, fx.away].sort().join("~")] = fx;
}
const toCanon = (name) => ALIAS[norm(name)] || canonMap[norm(name)] || null;

const yyyymmdd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");

async function fetchDate(ymd) {
  try {
    const r = await fetch(ESPN + ymd, { headers: { "User-Agent": "bolao-dias" } });
    if (!r.ok) return [];
    const j = await r.json();
    return j.events || [];
  } catch (e) {
    console.error("erro ao buscar", ymd, e.message);
    return [];
  }
}

const resultados = existsSync("resultados.json")
  ? JSON.parse(readFileSync("resultados.json", "utf-8"))
  : {};

// consulta os ultimos 3 dias (UTC) — cobre jogos noturnos e folga do cron espacado
const now = new Date();
const dates = [-2, -1, 0].map((off) => {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + off);
  return yyyymmdd(d);
});

let novos = 0;
const naoCasados = new Set();
for (const ymd of dates) {
  for (const ev of await fetchDate(ymd)) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    const status = comp.status?.type?.name;
    if (status !== "STATUS_FULL_TIME") continue; // so jogo encerrado
    const score = {};
    let ok = true;
    for (const c of comp.competitors || []) {
      const canon = toCanon(c.team?.displayName || c.team?.name);
      if (!canon) { naoCasados.add(c.team?.displayName); ok = false; continue; }
      score[canon] = parseInt(c.score, 10);
    }
    if (!ok || Object.keys(score).length !== 2) continue;
    const teams = Object.keys(score);
    const fx = pairIndex[[teams[0], teams[1]].sort().join("~")];
    if (!fx) { naoCasados.add(teams.join(" x ")); continue; }
    const val = [score[fx.home], score[fx.away]];
    if (JSON.stringify(resultados[fx.key]) !== JSON.stringify(val)) novos++;
    resultados[fx.key] = val;
  }
}

// correcoes manuais sempre vencem
if (existsSync("resultados_manuais.json")) {
  Object.assign(resultados, JSON.parse(readFileSync("resultados_manuais.json", "utf-8")));
}

writeFileSync("resultados.json", JSON.stringify(resultados, null, 1) + "\n");
console.log(`resultados.json: ${Object.keys(resultados).length} jogos (${novos} novos/alterados)`);
if (naoCasados.size) console.log("NAO CASADOS (conferir alias):", [...naoCasados]);
