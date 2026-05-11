/**
 * Pruebas de estrés/carga sobre el API local con autocannon.
 *
 * Requisitos previos:
 *   - El backend debe estar corriendo en http://127.0.0.1:3010 (npm run dev:server)
 *   - Si no existe ningún usuario, la suite hace bootstrap del admin de pruebas.
 *
 * Uso:
 *   node tests/stress/run-stress.mjs
 *
 * Salida:
 *   tests/results/stress-*.json   (resultados por escenario)
 *   tests/results/stress-summary.json  (resumen consolidado)
 */
import autocannon from "autocannon";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.resolve(__dirname, "..", "results");
fs.mkdirSync(RESULTS_DIR, { recursive: true });

const BASE_URL = process.env.STRESS_BASE_URL ?? "http://127.0.0.1:3010";
const ADMIN = {
  email: process.env.STRESS_ADMIN_EMAIL ?? "stress@admin.com",
  password: process.env.STRESS_ADMIN_PASSWORD ?? "secret123",
  nombre: "Stress Admin",
};

async function ping() {
  const r = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  if (!r || !r.ok) {
    console.error(`[stress] El backend no responde en ${BASE_URL}/api/health.`);
    console.error("        Lanzá 'npm run dev:server' antes de ejecutar.");
    process.exit(2);
  }
}

async function ensureAdminAndToken() {
  const need = await fetch(`${BASE_URL}/api/auth/bootstrap-needed`).then((r) => r.json());
  if (need.needed) {
    const r = await fetch(`${BASE_URL}/api/auth/bootstrap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ADMIN),
    });
    const body = await r.json();
    return body.accessToken;
  }
  const r = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password }),
  });
  if (!r.ok) {
    console.error(
      `[stress] No se pudo loguear con ${ADMIN.email}. Si tu base ya tiene admin, exportá STRESS_ADMIN_EMAIL/PASSWORD.`
    );
    process.exit(3);
  }
  const body = await r.json();
  return body.accessToken;
}

function runScenario(scenario) {
  return new Promise((resolve, reject) => {
    const instance = autocannon(scenario.opts, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
    autocannon.track(instance, { renderProgressBar: false });
  });
}

function summarize(name, r) {
  return {
    scenario: name,
    duration_s: r.duration,
    connections: r.connections,
    pipelining: r.pipelining,
    requests: {
      total: r.requests.total,
      avg_per_sec: r.requests.average,
      p99: r.requests.p99,
    },
    latency_ms: {
      avg: r.latency.average,
      p50: r.latency.p50,
      p90: r.latency.p90,
      p99: r.latency.p99,
      max: r.latency.max,
    },
    throughput_bytes: r.throughput.average,
    errors: r.errors,
    timeouts: r.timeouts,
    non2xx: r.non2xx,
  };
}

async function main() {
  console.log("[stress] Comprobando backend...");
  await ping();
  console.log("[stress] Asegurando admin de pruebas...");
  const token = await ensureAdminAndToken();
  console.log("[stress] Token OK. Lanzando escenarios...\n");

  const scenarios = [
    {
      name: "health-baseline",
      opts: {
        url: `${BASE_URL}/api/health`,
        connections: 50,
        duration: 10,
        pipelining: 1,
      },
    },
    {
      name: "login-burst",
      opts: {
        url: `${BASE_URL}/api/auth/login`,
        method: "POST",
        connections: 20,
        duration: 10,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password }),
      },
    },
    {
      name: "productos-list-auth",
      opts: {
        url: `${BASE_URL}/api/productos`,
        connections: 50,
        duration: 10,
        headers: { Authorization: `Bearer ${token}` },
      },
    },
    {
      name: "clientes-list-auth",
      opts: {
        url: `${BASE_URL}/api/clientes`,
        connections: 50,
        duration: 10,
        headers: { Authorization: `Bearer ${token}` },
      },
    },
    {
      name: "ventas-list-auth",
      opts: {
        url: `${BASE_URL}/api/ventas`,
        connections: 50,
        duration: 10,
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  ];

  const summary = [];
  for (const sc of scenarios) {
    console.log(`▶ Ejecutando escenario: ${sc.name}`);
    const r = await runScenario(sc);
    fs.writeFileSync(
      path.join(RESULTS_DIR, `stress-${sc.name}.json`),
      JSON.stringify(r, null, 2)
    );
    const sum = summarize(sc.name, r);
    summary.push(sum);
    console.log(
      `   ↳ ${sum.requests.total} reqs · ${sum.requests.avg_per_sec.toFixed(
        1
      )} req/s · p99 ${sum.latency_ms.p99} ms · errores=${sum.errors} non2xx=${sum.non2xx}\n`
    );
  }

  const outPath = path.join(RESULTS_DIR, "stress-summary.json");
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`\n[stress] Resumen guardado en ${outPath}`);
}

main().catch((err) => {
  console.error("[stress] Error fatal:", err);
  process.exit(1);
});
