// Abre formulários publicados como um iPhone (WebKit) e um Android (Chromium)
// e registra erros de JavaScript, requisições que falharam e a tela final.
// Saída sem dados pessoais: só o final do link do formulário.
import { webkit, chromium, devices } from "playwright";

const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const HOSTS = (process.env.HOSTS || "").split(",").filter(Boolean);

const r = await fetch(
  `${SUPA}/rest/v1/formularios?select=share_slug,titulo&status=eq.publicado&publico=eq.true&order=updated_at.desc&limit=4`,
  { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
);
const forms = r.ok ? await r.json() : [];
console.log(`formularios publicos: ${forms.length} (HTTP ${r.status})`);

const alvos = [
  ["iPhone (WebKit)", webkit, devices["iPhone 13"]],
  ["Android (Chromium)", chromium, devices["Pixel 7"]],
];
for (const [nome, tipo, dev] of alvos) {
  const browser = await tipo.launch();
  for (const host of HOSTS) {
    for (const f of forms) {
      const ctx = await browser.newContext({ ...dev, locale: "pt-BR" });
      const page = await ctx.newPage();
      const erros = [];
      page.on("pageerror", (e) => erros.push(`pageerror: ${String(e.message).slice(0, 300)}`));
      page.on("console", (m) => m.type() === "error" && erros.push(`console: ${m.text().slice(0, 300)}`));
      page.on("requestfailed", (q) => erros.push(`falhou: ${q.url().replace(/\?.*/, "").slice(-90)} (${q.failure()?.errorText})`));
      page.on("response", (s) => s.status() >= 400 && erros.push(`HTTP ${s.status()}: ${s.url().replace(/\?.*/, "").slice(-90)}`));
      const url = `https://${host}/f/${f.share_slug}`;
      let status = "?";
      try {
        const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
        status = resp?.status();
      } catch (e) {
        erros.push(`goto: ${String(e).slice(0, 200)}`);
      }
      await page.waitForTimeout(2500);
      const texto = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
      const tela = texto.includes("didn't load")
        ? "ERRO (This page didn't load)"
        : texto.includes("Enviar resposta")
          ? "OK (formulario com botao Enviar)"
          : `outra: ${texto.slice(0, 80)}`;
      const id = `${nome.split(" ")[0]}-${host.split(".")[0]}-${f.share_slug.slice(-4)}`;
      await page.screenshot({ path: `telas/${id}.png`, fullPage: false }).catch(() => {});
      console.log(`\n[${nome}] ${host} …/${f.share_slug.slice(-4)} HTTP ${status} -> ${tela}`);
      for (const e of erros.slice(0, 15)) console.log("   " + e);
      await ctx.close();
    }
  }
  await browser.close();
}
