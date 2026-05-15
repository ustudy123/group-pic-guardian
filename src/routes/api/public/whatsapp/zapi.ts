import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function extractEncarregado(groupName: string): string {
  const cleaned = groupName
    .replace(/^(fotos|obra|equipe|grupo|relat[oó]rio[s]?)\s+/i, "")
    .split(/[-–—|·•]/)[0]
    .trim();
  return cleaned || groupName.trim();
}

type ZapiPayload = {
  instanceId?: string;
  messageId?: string;
  phone?: string;
  fromMe?: boolean;
  momment?: number; // ms
  chatName?: string;
  senderName?: string;
  participantPhone?: string;
  isGroup?: boolean;
  type?: string;
  image?: { imageUrl?: string; mimeType?: string; caption?: string };
  video?: { videoUrl?: string; mimeType?: string; caption?: string };
  document?: { documentUrl?: string; mimeType?: string; caption?: string; fileName?: string };
};

export const Route = createFileRoute("/api/public/whatsapp/zapi")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Segurança: Z-API envia o "Client-Token" configurado na conta
          const expected = process.env.ZAPI_CLIENT_TOKEN;
          if (expected) {
            const provided = request.headers.get("client-token") ?? "";
            if (provided !== expected) {
              return new Response("Unauthorized", { status: 401 });
            }
          }

          if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            return new Response("Server not configured", { status: 500 });
          }

          let body: ZapiPayload;
          try {
            body = (await request.json()) as ZapiPayload;
          } catch {
            return new Response("Invalid JSON", { status: 400 });
          }

          // Log para auditoria/debug
          await supabaseAdmin.from("eventos_raw").insert({
            tipo_evento: "zapi_webhook",
            message_id: body.messageId ?? null,
            chat_id: body.phone ?? null,
            payload: JSON.parse(JSON.stringify(body)),
          });

          // Só processamos imagens recebidas em grupos (não enviadas por nós)
          if (body.fromMe) return Response.json({ ok: true, skipped: "fromMe" });
          if (!body.isGroup) return Response.json({ ok: true, skipped: "notGroup" });
          if (!body.image?.imageUrl) return Response.json({ ok: true, skipped: "notImage" });
          if (!body.messageId || !body.phone || !body.chatName || !body.momment) {
            return Response.json({ ok: true, skipped: "missingFields" });
          }

          const groupJid = body.phone; // no Z-API o "phone" do grupo é o JID
          const groupName = body.chatName;
          const msgId = body.messageId;
          const mime = body.image.mimeType || "image/jpeg";
          if (!mime.startsWith("image/")) return Response.json({ ok: true, skipped: "notImageMime" });

          // Idempotência
          const { data: existing } = await supabaseAdmin
            .from("fotos")
            .select("id")
            .eq("message_id", msgId)
            .maybeSingle();
          if (existing) return Response.json({ ok: true, duplicated: true, id: existing.id });

          // Upsert encarregado
          const encarregadoNome = extractEncarregado(groupName);
          let encarregadoId: string;
          let encarregadoFinal: string;
          const { data: encExistente } = await supabaseAdmin
            .from("encarregados")
            .select("id, nome")
            .eq("grupo_whatsapp_id", groupJid)
            .maybeSingle();
          if (encExistente) {
            encarregadoId = encExistente.id;
            encarregadoFinal = encExistente.nome;
          } else {
            const { data: novo, error: errEnc } = await supabaseAdmin
              .from("encarregados")
              .insert({
                grupo_whatsapp_id: groupJid,
                grupo_whatsapp_nome: groupName,
                nome: encarregadoNome,
              })
              .select("id, nome")
              .single();
            if (errEnc || !novo) {
              console.error("Erro inserindo encarregado:", errEnc);
              return new Response("Erro registrando encarregado", { status: 500 });
            }
            encarregadoId = novo.id;
            encarregadoFinal = novo.nome;
          }

          // Baixa a imagem do Z-API
          const imgRes = await fetch(body.image.imageUrl);
          if (!imgRes.ok) {
            console.error("Erro baixando imagem Z-API:", imgRes.status);
            return new Response("Erro baixando imagem", { status: 502 });
          }
          const buffer = Buffer.from(await imgRes.arrayBuffer());

          // Caminho no storage
          const date = new Date(body.momment);
          const local = new Date(date.getTime() - 3 * 60 * 60 * 1000);
          const yyyy = local.getUTCFullYear();
          const mm = String(local.getUTCMonth() + 1).padStart(2, "0");
          const dd = String(local.getUTCDate()).padStart(2, "0");
          const ext = mime.split("/")[1]?.split("+")[0] || "jpg";
          const safeEnc = encarregadoFinal.replace(/[^a-zA-Z0-9_-]/g, "_");
          const safeMsg = msgId.replace(/[^a-zA-Z0-9_-]/g, "_");
          const storagePath = `${safeEnc}/${yyyy}-${mm}/${dd}/${Math.floor(body.momment / 1000)}_${safeMsg}.${ext}`;

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
              encarregado_id: encarregadoId,
              message_id: msgId,
              remetente_telefone: body.participantPhone ?? null,
              remetente_nome: body.senderName ?? null,
              caption: body.image.caption ?? null,
              mime_type: mime,
              tamanho_bytes: buffer.length,
              storage_path: storagePath,
              data_envio: date.toISOString(),
              data_pasta: `${yyyy}-${mm}-${dd}`,
            })
            .select("id")
            .single();

          if (errFoto) {
            console.error("Erro inserindo foto:", errFoto);
            await supabaseAdmin.storage.from("obras-fotos").remove([storagePath]);
            return new Response("Erro registrando foto", { status: 500 });
          }

          // Atualiza status do bot
          await supabaseAdmin.from("whatsapp_bot_status").upsert({
            id: "default",
            connection_status: "connected",
            last_event_at: new Date().toISOString(),
            meta: { provider: "zapi" },
          });

          return Response.json({ ok: true, id: foto.id, storage_path: storagePath });
        } catch (error) {
          console.error("Erro inesperado Z-API webhook:", error);
          return new Response("Erro interno", { status: 500 });
        }
      },
    },
  },
});
