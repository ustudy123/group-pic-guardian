import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function extractEncarregado(groupName: string): string {
  // "Fotos Wilson", "Obra Wilson", "Equipe Wilson - Norte" -> "Wilson"
  const cleaned = groupName
    .replace(/^(fotos|obra|equipe|grupo|relat[oó]rio[s]?)\s+/i, "")
    .split(/[-–—|·•]/)[0]
    .trim();
  return cleaned || groupName.trim();
}

export const Route = createFileRoute("/api/public/whatsapp/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const expected = process.env.WHATSAPP_BOT_SECRET;
          if (!expected) {
            return new Response("Server not configured", { status: 500 });
          }
          const provided = request.headers.get("x-bot-secret") ?? "";
          if (!provided || !safeEqual(provided, expected)) {
            return new Response("Unauthorized", { status: 401 });
          }

          if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            console.error("WhatsApp ingest misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
            return new Response("Server not configured: missing Supabase admin access", { status: 500 });
          }

          let form: FormData;
          try {
            form = await request.formData();
          } catch {
            return new Response("Invalid multipart body", { status: 400 });
          }

          const file = form.get("file");
          const metaRaw = form.get("meta");
          if (!(file instanceof File) || typeof metaRaw !== "string") {
            return new Response("Missing file or meta", { status: 400 });
          }

        let meta: {
          group_jid: string;
          group_name: string;
          sender_jid?: string;
          sender_name?: string;
          caption?: string;
          msg_id: string;
          timestamp: number; // unix seconds
          mime_type?: string;
        };
        try {
          meta = JSON.parse(metaRaw);
        } catch {
          return new Response("Invalid meta JSON", { status: 400 });
        }

        if (!meta.group_jid || !meta.group_name || !meta.msg_id || !meta.timestamp) {
          return new Response("Missing required meta fields", { status: 400 });
        }

        const mime = meta.mime_type || file.type || "image/jpeg";
        if (!mime.startsWith("image/")) {
          return new Response("Only images are accepted", { status: 415 });
        }

        // Idempotência: já existe?
        const { data: existing } = await supabaseAdmin
          .from("fotos")
          .select("id")
          .eq("whatsapp_msg_id", meta.msg_id)
          .maybeSingle();
        if (existing) {
          return Response.json({ ok: true, duplicated: true, id: existing.id });
        }

        // Upsert grupo
        const encarregado = extractEncarregado(meta.group_name);
        const { data: grupoExistente } = await supabaseAdmin
          .from("grupos")
          .select("id, encarregado")
          .eq("whatsapp_jid", meta.group_jid)
          .maybeSingle();

        let grupoId: string;
        let encarregadoFinal: string;
        if (grupoExistente) {
          grupoId = grupoExistente.id;
          encarregadoFinal = grupoExistente.encarregado;
        } else {
          const { data: novo, error: errGrupo } = await supabaseAdmin
            .from("grupos")
            .insert({
              whatsapp_jid: meta.group_jid,
              nome_exibicao: meta.group_name,
              encarregado,
            })
            .select("id, encarregado")
            .single();
          if (errGrupo || !novo) {
            console.error("Erro inserindo grupo:", errGrupo);
            return new Response("Erro registrando grupo", { status: 500 });
          }
          grupoId = novo.id;
          encarregadoFinal = novo.encarregado;
        }

        // Caminho no storage
        const date = new Date(meta.timestamp * 1000);
        // Fuso America/Sao_Paulo (UTC-3, sem horário de verão atualmente)
        const local = new Date(date.getTime() - 3 * 60 * 60 * 1000);
        const yyyy = local.getUTCFullYear();
        const mm = String(local.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(local.getUTCDate()).padStart(2, "0");
        const anoMes = `${yyyy}-${mm}`;
        const ext = mime.split("/")[1]?.split("+")[0] || "jpg";
        const safeEnc = encarregadoFinal.replace(/[^a-zA-Z0-9_-]/g, "_");
        const storagePath = `${safeEnc}/${anoMes}/${dd}/${meta.timestamp}_${meta.msg_id.replace(/[^a-zA-Z0-9_-]/g, "_")}.${ext}`;

        const buffer = Buffer.from(await file.arrayBuffer());
        const { error: errUp } = await supabaseAdmin.storage
          .from("obras-fotos")
          .upload(storagePath, buffer, { contentType: mime, upsert: false });
        if (errUp) {
          console.error("Erro upload:", errUp);
          return new Response("Erro upload storage", { status: 500 });
        }

        const { data: foto, error: errFoto } = await supabaseAdmin
          .from("fotos")
          .insert({
            grupo_id: grupoId,
            encarregado: encarregadoFinal,
            whatsapp_msg_id: meta.msg_id,
            remetente_jid: meta.sender_jid ?? null,
            remetente_nome: meta.sender_name ?? null,
            caption: meta.caption ?? null,
            mime_type: mime,
            tamanho_bytes: buffer.length,
            storage_path: storagePath,
            data_envio: date.toISOString(),
            ano_mes: anoMes,
            dia: dd,
          })
          .select("id")
          .single();

        if (errFoto) {
          console.error("Erro inserindo foto:", errFoto);
          await supabaseAdmin.storage.from("obras-fotos").remove([storagePath]);
          return new Response("Erro registrando foto", { status: 500 });
        }

        await supabaseAdmin
          .from("grupos")
          .update({ ultima_foto_em: date.toISOString() })
          .eq("id", grupoId);

          return Response.json({ ok: true, id: foto.id, storage_path: storagePath });
        } catch (error) {
          console.error("Unexpected WhatsApp ingest error:", error);
          return new Response("Erro interno ao processar upload", { status: 500 });
        }
      },
    },
  },
});
