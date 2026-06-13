// Busca o video "MELHORES MOMENTOS" da CazéTV no YouTube para cada jogo ja
// encerrado e guarda o videoId em highlights.json. Sem chave de API.
// Idempotente: so busca jogo que ainda nao tem highlight (cache permanente).
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// nome de transmissao (como a CazéTV escreve nos titulos)
const PT = {
  "Mexico":"México","South Africa":"África do Sul","South Korea":"Coreia do Sul",
  "Czech Republic":"Tchéquia","Canada":"Canadá","Bosnia and Herzegovina":"Bósnia",
  "Qatar":"Catar","Switzerland":"Suíça","United States":"Estados Unidos","Paraguay":"Paraguai",
  "Australia":"Austrália","Turkey":"Turquia","Brazil":"Brasil","Morocco":"Marrocos",
  "Haiti":"Haiti","Scotland":"Escócia","Germany":"Alemanha","Curaçao":"Curaçao",
  "Ivory Coast":"Costa do Marfim","Ecuador":"Equador","Netherlands":"Holanda","Japan":"Japão",
  "Sweden":"Suécia","Tunisia":"Tunísia","Belgium":"Bélgica","Egypt":"Egito","Iran":"Irã",
  "New Zealand":"Nova Zelândia","Spain":"Espanha","Cape Verde":"Cabo Verde",
  "Saudi Arabia":"Arábia Saudita","Uruguay":"Uruguai","France":"França","Senegal":"Senegal",
  "Iraq":"Iraque","Norway":"Noruega","Argentina":"Argentina","Algeria":"Argélia",
  "Austria":"Áustria","Jordan":"Jordânia","Portugal":"Portugal","DR Congo":"Congo",
  "Uzbekistan":"Uzbequistão","Colombia":"Colômbia","England":"Inglaterra","Croatia":"Croácia",
  "Ghana":"Gana","Panama":"Panamá"
};

const norm = (s) => (s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");

const fixtures = JSON.parse(readFileSync("fixtures.json","utf-8"));
const resultados = existsSync("resultados.json") ? JSON.parse(readFileSync("resultados.json","utf-8")) : {};
const highlights = existsSync("highlights.json") ? JSON.parse(readFileSync("highlights.json","utf-8")) : {};
const fxByKey = {}; fixtures.forEach(f => fxByKey[f.key] = f);

async function searchYT(query) {
  // Caminho oficial: YouTube Data API v3 (funciona de qualquer IP, inclusive
  // a nuvem do GitHub). Usa a chave em YOUTUBE_API_KEY (secret do repo).
  const APIKEY = process.env.YOUTUBE_API_KEY;
  if (APIKEY) {
    try {
      const u = "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=6&regionCode=BR&relevanceLanguage=pt&q=" + encodeURIComponent(query) + "&key=" + APIKEY;
      const r = await fetch(u);
      if (r.ok) {
        const d = await r.json();
        return (d.items || []).filter(it => it.id && it.id.videoId)
          .map(it => ({ id: it.id.videoId, title: it.snippet.title, ch: it.snippet.channelTitle }));
      }
      console.log("  (API HTTP", r.status, ")");
    } catch (e) { console.log("  (erro API:", e.message, ")"); }
  }
  // Fallback: InnerTube (so se a chave nao estiver setada)
  try {
    const KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
    const body = JSON.stringify({ context: { client: { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "pt", gl: "BR" } }, query });
    const r = await fetch("https://www.youtube.com/youtubei/v1/search?key=" + KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA, "Accept-Language": "pt-BR" },
      body
    });
    if (!r.ok) { console.log("  (HTTP", r.status, "innertube)"); return []; }
    const data = await r.json();
    const out = [];
    (function walk(o) {
      if (!o || typeof o !== "object") return;
      if (o.videoRenderer) {
        const vr = o.videoRenderer, id = vr.videoId;
        const t = (vr.title && vr.title.runs) ? vr.title.runs.map(x => x.text).join("") : "";
        let ch = ""; try { ch = vr.ownerText.runs[0].text; } catch (e) {}
        if (id) out.push({ id, title: t, ch });
      }
      (Array.isArray(o) ? o : Object.values(o)).forEach(walk);
    })(data);
    return out;
  } catch (e) { return []; }
}

let novos = 0;
for (const key of Object.keys(resultados)) {
  if (highlights[key]) continue;
  const fx = fxByKey[key]; if (!fx) continue;
  const h = PT[fx.home] || fx.home, a = PT[fx.away] || fx.away;
  const res = await searchYT(`cazétv melhores momentos ${h} x ${a} copa do mundo 2026`);
  const th = norm(h).slice(0, 5), ta = norm(a).slice(0, 5);
  const hit = res.find(v =>
    /caz/i.test(v.ch) &&
    norm(v.title).includes("melhoresmomentos") &&
    norm(v.title).includes(th) && norm(v.title).includes(ta)
  );
  if (hit) { highlights[key] = hit.id; novos++; console.log("OK:", key, "->", hit.id, "|", hit.title.slice(0, 55)); }
  else console.log("sem highlight ainda:", key);
}

writeFileSync("highlights.json", JSON.stringify(highlights, null, 1) + "\n");
console.log(`highlights.json: ${Object.keys(highlights).length} videos (${novos} novos)`);
