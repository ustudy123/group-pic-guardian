// Hook público chamado pelo worker externo (GitHub Action, cron, etc).
// Processa 1 chunk por chamada de forma idempotente:
//   - capa.pdf primeiro
//   - depois rua-000.pdf, rua-001.pdf...
//   - quando todas as ruas terminam, concatena tudo em 1 PDF final e finaliza
//
// Autenticação: header `x-relatorios-secret` deve bater com RELATORIOS_WORKER_SECRET.
// Body opcional: { jobId?: string }. Sem jobId, pega o próximo da fila.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildCapaChunk, buildRuaChunk, concatPDFs } from "@/lib/pdf-builder.server";

const BUCKET = "vistorias-fotos";

function chunksFolder(jobId: string) {
  return `relatorios/jobs/${jobId}`;
}
function ruaChunkName(i: number) {
  return `rua-${String(i).padStart(3, "0")}.pdf`;
}

async function listChunkFiles(jobId: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin.storage.from(BUCKET).list(chunksFolder(jobId));
  return new Set((data ?? []).map((f: any) => f.name));
}

async function downloadChunk(jobId: string, name: string): Promise<Uint8Array | null> {
  const { data } = await supabaseAdmin.storage
    .from(BUCKET)
    .download(`${chunksFolder(jobId)}/${name}`);
  if (!data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

async function uploadChunk(jobId: string, name: string, bytes: Uint8Array) {
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(`${chunksFolder(jobId)}/${name}`, bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (error) throw new Error(`upload ${name}: ${error.message}`);
}

async function pickJob(jobId?: string) {
  if (jobId) {
    const { data } = await supabaseAdmin
      .from("vistoria_relatorio_jobs")
      .select("*")
      .eq("id", jobId)
      .single();
    return data;
  }
  const { data } = await supabaseAdmin
    .from("vistoria_relatorio_jobs")
    .select("*")
    .in("status", ["na_fila", "processando"])
    .order("solicitado_em", { ascending: true })
    .limit(1);
  return (data ?? [])[0] ?? null;
}

export const Route = createFileRoute("/api/public/hooks/processar-relatorios")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-relatorios-secret");
        if (!process.env.RELATORIOS_WORKER_SECRET) {
          return new Response("Worker secret não configurado.", { status: 500 });
        }
        if (secret !== process.env.RELATORIOS_WORKER_SECRET) {
          return new Response("Não autorizado.", { status: 401 });
        }

        let body: any = {};
        try { body = await request.json(); } catch {}
        const job = (await pickJob(body.jobId)) as any;
        if (!job) {
          return Response.json({ done: true, idle: true });
        }

        // Marca processando se for primeira execução
        if (job.status === "na_fila") {
          await supabaseAdmin
            .from("vistoria_relatorio_jobs")
            .update({ status: "processando", iniciado_em: new Date().toISOString() })
            .eq("id", job.id);
        }

        try {
          // Carrega bairro + contrato
          const { data: bairro, error: be } = await supabaseAdmin
            .from("bairros")
            .select("id, nome, contratos(id, numero, descricao, regional, municipio, responsavel_tecnico, periodo)")
            .eq("id", job.bairro_id)
            .single();
          if (be || !bairro) throw new Error(be?.message ?? "Bairro não encontrado.");
          const contrato: any = (bairro as any).contratos ?? {};
          const bairroNome = (bairro as any).nome;

          // Ruas ordenadas
          const { data: ruas, error: re } = await supabaseAdmin
            .from("ruas")
            .select("id, nome, ordem")
            .eq("bairro_id", job.bairro_id)
            .order("ordem")
            .order("nome");
          if (re) throw new Error(re.message);
          const ruasArr = (ruas ?? []) as any[];

          // Atualiza total caso tenha mudado
          if (job.progresso_total !== ruasArr.length) {
            await supabaseAdmin
              .from("vistoria_relatorio_jobs")
              .update({ progresso_total: ruasArr.length })
              .eq("id", job.id);
          }

          const existing = await listChunkFiles(job.id);

          // 1) Capa
          if (!existing.has("capa.pdf")) {
            const capa = await buildCapaChunk({ tipo: job.tipo, bairroNome, contrato });
            await uploadChunk(job.id, "capa.pdf", capa);
            return Response.json({ done: false, step: "capa", jobId: job.id });
          }

          // 2) Próxima rua faltando
          for (let i = 0; i < ruasArr.length; i++) {
            const name = ruaChunkName(i);
            if (existing.has(name)) continue;
            const rua = ruasArr[i];

            // Carrega fotos aprovadas da rua
            const { data: fotos } = await supabaseAdmin
              .from("vistoria_fotos")
              .select("*")
              .eq("rua_id", rua.id)
              .eq("status", "aprovada")
              .order("captured_at", { ascending: true });
            const fotosArr: any[] = (fotos ?? []) as any[];

            // Pro tipo=pos, precisamos do mapa PRÉ desse bairro pra parear
            let fotosPrePos: any[] | undefined;
            if (job.tipo === "pos") {
              const ruaIds = ruasArr.map((r) => r.id);
              const { data: pres } = await supabaseAdmin
                .from("vistoria_fotos")
                .select("id, fase, tipo, storage_path_carimbada, captured_at")
                .in("rua_id", ruaIds)
                .eq("fase", "pre")
                .eq("tipo", "rua")
                .eq("status", "aprovada");
              fotosPrePos = (pres ?? []) as any[];
            }

            const ruaChunk = await buildRuaChunk({
              supabase: supabaseAdmin,
              tipo: job.tipo,
              rua,
              fotos: fotosArr,
              fotosPrePos,
            });
            await uploadChunk(job.id, name, ruaChunk);

            await supabaseAdmin
              .from("vistoria_relatorio_jobs")
              .update({
                progresso_atual: i + 1,
                fotos_processadas: (job.fotos_processadas ?? 0) + fotosArr.length,
              })
              .eq("id", job.id);

            return Response.json({
              done: false,
              step: `rua-${i + 1}/${ruasArr.length}`,
              jobId: job.id,
            });
          }

          // 3) Tudo pronto → concatenar
          const parts: Uint8Array[] = [];
          const capa = await downloadChunk(job.id, "capa.pdf");
          if (capa) parts.push(capa);
          for (let i = 0; i < ruasArr.length; i++) {
            const part = await downloadChunk(job.id, ruaChunkName(i));
            if (part) parts.push(part);
          }
          const finalBytes = await concatPDFs(parts);

          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const finalPath = `relatorios/${job.bairro_id}/${job.tipo}-${timestamp}.pdf`;
          const { error: upErr } = await supabaseAdmin.storage
            .from(BUCKET)
            .upload(finalPath, finalBytes, {
              contentType: "application/pdf",
              upsert: false,
            });
          if (upErr) throw new Error(`upload final: ${upErr.message}`);

          await supabaseAdmin.from("vistoria_relatorios").insert({
            contrato_id: job.contrato_id,
            bairro_id: job.bairro_id,
            pdf_path: finalPath,
            gerado_por: job.solicitado_por,
          });

          await supabaseAdmin
            .from("vistoria_relatorio_jobs")
            .update({
              status: "pronto",
              pdf_path: finalPath,
              concluido_em: new Date().toISOString(),
            })
            .eq("id", job.id);

          // Limpa chunks parciais (best-effort)
          try {
            const toDelete = ["capa.pdf", ...ruasArr.map((_, i) => ruaChunkName(i))].map(
              (n) => `${chunksFolder(job.id)}/${n}`,
            );
            await supabaseAdmin.storage.from(BUCKET).remove(toDelete);
          } catch {}

          return Response.json({ done: true, jobId: job.id, pdfPath: finalPath });
        } catch (err: any) {
          await supabaseAdmin
            .from("vistoria_relatorio_jobs")
            .update({
              status: "erro",
              mensagem_erro: String(err?.message ?? err).slice(0, 500),
            })
            .eq("id", job.id);
          return Response.json(
            { done: true, error: String(err?.message ?? err), jobId: job.id },
            { status: 500 },
          );
        }
      },
    },
  },
});
