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
  try {
    const r = await fetch("https://www.youtube.com/results?search_query=" + encodeURIComponent(query) + "&hl=pt&gl=BR", {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        // cookie de consentimento: faz o YouTube servir a pagina real (e nao o
        // muro de consentimento) para IPs de datacenter como os do GitHub Actions
        "Cookie": "SOCS=CAISEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg; CONSENT=YES+cb.20210328-17-p0.en+FX+667"
      }
    });
    if (!r.ok) { console.log("  (HTTP", r.status, "na busca)"); return []; }
    const h = await r.text();
    const m = h.match(/ytInitialData\s*=\s*(\{.+?\});<\/script>/s);
    if (!m) { console.log("  (sem ytInitialData - possivel bloqueio do YouTube)"); return []; }
    let data; try { data = JSON.parse(m[1]); } catch (e) { return []; }
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
