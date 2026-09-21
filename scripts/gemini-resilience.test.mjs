/**
 * Teste da camada Gemini contra instabilidade.
 *
 * Este é o único ponto do app que depende do humor de um serviço de fora, e
 * é onde um bug só aparece no pior momento: quando o Google está de joelhos e
 * você quer usar o app. Esperar o próximo pico para descobrir se o retry
 * funciona não é uma estratégia.
 *
 * Aqui sobe um servidor que finge ser a API do Gemini e devolve 503 sob
 * demanda. `GEMINI_API_BASE` aponta a camada inteira para ele.
 *
 *   npm run test:gemini
 *
 * Roda com o strip-types do próprio Node: sem runner, sem build, sem uma
 * dependência de desenvolvimento a mais para manter.
 */
import http from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let hits = [];
let failuresLeft = 0;
let alwaysFailModel = null;
let quotaMode = false;

const server = http.createServer((req, res) => {
  const model = req.url.split("/").pop().split(":")[0];
  hits.push(model);

  if (quotaMode) {
    res.writeHead(429, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: { code: 429, message: "Quota exceeded: requests per day", status: "RESOURCE_EXHAUSTED" },
      }),
    );
    return;
  }

  const fail =
    (alwaysFailModel && model === alwaysFailModel) || (!alwaysFailModel && failuresLeft-- > 0);

  if (fail) {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: { code: 503, message: "This model is currently experiencing high demand.", status: "UNAVAILABLE" },
      }),
    );
    return;
  }

  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ ok: true, model }) }] } }],
    }),
  );
});

await new Promise((resolve) => server.listen(0, resolve));

process.env.GEMINI_API_BASE = `http://127.0.0.1:${server.address().port}`;
process.env.GEMINI_API_KEY = "fake-key-para-teste";

const { generate, generateResilient, GeminiQuotaError, GeminiUnavailableError } = await import(
  new URL(`file://${path.join(ROOT, "src/lib/gemini.ts").replace(/\\/g, "/")}`).href
);

function reset(failures, always = null, quota = false) {
  hits = [];
  failuresLeft = failures;
  alwaysFailModel = always;
  quotaMode = quota;
}

let failed = 0;

function check(label, condition, detail = "") {
  console.log(`${condition ? "ok  " : "FALHA"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failed++;
}

// 1. Pico passageiro: insiste e entrega.
reset(2);
const recovered = await generate("teste", { schema: {}, model: "modelo-leve" });
check("recupera depois de dois 503", recovered.ok === true && hits.length === 3, `${hits.length} tentativas`);

// 2. Sobrecarga que não passa: erro tipado e legível, nunca o JSON cru.
reset(0, "modelo-leve");
try {
  await generate("teste", { schema: {}, model: "modelo-leve" });
  check("desiste com erro tipado", false, "não lançou");
} catch (err) {
  check(
    "desiste com erro tipado",
    err instanceof GeminiUnavailableError && !err.message.includes("{"),
    `${hits.length} tentativas`,
  );
}

// 3. Modelo pesado fora, leve de pé: cai para o leve e DECLARA que caiu.
reset(0, "modelo-pesado");
const degraded = await generateResilient("teste", {
  schema: {},
  model: "modelo-pesado",
  fallbackModel: "modelo-leve",
});
check(
  "cai para o modelo leve e avisa",
  degraded.model === "modelo-leve" && degraded.degraded === true,
);

// 4. Sem plano B declarado, o erro sobe: nada de escolher modelo sozinho.
reset(0, "modelo-pesado");
try {
  await generateResilient("teste", { schema: {}, model: "modelo-pesado" });
  check("sem fallback, propaga", false, "não lançou");
} catch (err) {
  check("sem fallback, propaga", err instanceof GeminiUnavailableError);
}

// 5. Quota não é sobrecarga. Limite DIÁRIO não pode insistir (cada tentativa
//    queima uma das requisições que restam) nem cair para outro modelo: a
//    quota é da conta, não do modelo.
reset(0, null, true);
try {
  await generateResilient("teste", {
    schema: {},
    model: "modelo-pesado",
    fallbackModel: "modelo-leve",
  });
  check("quota diária não vira fallback", false, "não lançou");
} catch (err) {
  check(
    "quota diária não vira fallback",
    err instanceof GeminiQuotaError && hits.length === 1,
    `${hits.length} tentativa(s)`,
  );
}

server.close();

if (failed > 0) {
  console.error(`\n${failed} verificação(ões) falharam.`);
  process.exit(1);
}
console.log("\nCamada Gemini resiliente: tudo certo.");
