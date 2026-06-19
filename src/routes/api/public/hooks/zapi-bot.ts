import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Webhook receiver for Z-API "Ao receber" events.
// Replaces the old Railway worker. URL must include the secret token:
//   POST /api/public/hooks/zapi-bot/{TOKEN}
// where {TOKEN} === process.env.ZAPI_WEBHOOK_TOKEN.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

const BUCKET = "fotos-obras";

type ZapiImage = {
  imageUrl?: string;
  caption?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
};

type ZapiPayload = {
  isGroup?: boolean;
  phone?: string;          // grupo: "120363...-group"; chat privado: número
  chatName?: string;
  messageId?: string;
  momment?: number;        // Z-API typo: "momment" (epoch ms)
  moment?: number;
  fromMe?: boolean;
  participantPhone?: string;
  senderName?: string;
  senderPhoto?: string;
  type?: string;
  image?: ZapiImage;
} & Record<string, unknown>;

function ext(mime?: string): string {
  if (!mime) return "jpeg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpeg";
}

function ymd(d: Date): string {
  // Data-pasta em horário de São Paulo (mesma lógica do painel)
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d); // YYYY-MM-DD
}

export const Route = createFileRoute("/api/public/hooks/zapi-bot/$token")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request, params }) => {
        const expected = process.env.ZAPI_WEBHOOK_TOKEN;
        if (!expected) {
          console.error("[zapi-bot] ZAPI_WEBHOOK_TOKEN não configurado");
          return json({ error: "token_nao_configurado" }, 503);
        }
        if (params.token !== expected) {
          console.warn("[zapi-bot] token inválido");
          return json({ error: "forbidden" }, 403);
        }

        let body: ZapiPayload;
        try {
          body = (await request.json()) as ZapiPayload;
        } catch {
          return json({ ok: true, ignored: "json_invalido" });
        }

        // 1) Auditoria: insere SEMPRE em eventos_raw.
        // O trigger descobrir_grupo_de_evento já cuida de criar/atualizar grupos.
        const tipoEvento =
          (body.image ? "image" : String(body.type || "message")).toLowerCase();
        const chatId = String(body.phone || "");
        const messageId = String(body.messageId || "");

        try {
          await supabaseAdmin.from("eventos_raw").insert({
            tipo_evento: tipoEvento,
            chat_id: chatId || null,
            message_id: messageId || null,
            payload: body as unknown as Record<string, unknown>,
            processado: false,
          });
        } catch (e) {
          console.error("[zapi-bot] erro insert eventos_raw:", e);
        }

        // 2) Só processa imagem de grupo enviada por outros (fromMe=false).
        if (!body.image || !body.isGroup || body.fromMe) {
          return json({ ok: true, ignored: "nao_eh_imagem_de_grupo" });
        }
        if (!chatId || !messageId) {
          return json({ ok: true, ignored: "sem_chat_ou_message_id" });
        }

        // 3) Procura encarregado ativo pelo JID do grupo.
        const { data: enc, error: encErr } = await supabaseAdmin
          .from("encarregados")
          .select("id, nome")
          .eq("grupo_whatsapp_id", chatId)
          .eq("ativo", true)
          .maybeSingle();

        if (encErr) {
          console.error("[zapi-bot] erro buscando encarregado:", encErr);
          return json({ ok: true, error: "db_error" });
        }
        if (!enc) {
          console.warn(
            `[zapi-bot] Grupo ${chatId} (${body.chatName || "?"}) não cadastrado`,
          );
          return json({ ok: true, ignored: "grupo_nao_cadastrado" });
        }

        // 4) Idempotência: se essa foto já existe, retorna.
        const { data: existente } = await supabaseAdmin
          .from("fotos")
          .select("id")
          .eq("message_id", messageId)
          .maybeSingle();
        if (existente) {
          return json({ ok: true, ignored: "ja_processada", id: existente.id });
        }

        // 5) Baixa a imagem (Z-API entrega URL HTTPS pública temporária).
        const imageUrl = body.image.imageUrl;
        if (!imageUrl) {
          return json({ ok: true, ignored: "sem_image_url" });
        }

        let bytes: ArrayBuffer;
        let contentType = body.image.mimeType || "image/jpeg";
        try {
          const r = await fetch(imageUrl);
          if (!r.ok) {
            console.error(`[zapi-bot] download falhou ${r.status} ${imageUrl}`);
            return json({ ok: true, error: "download_falhou" });
          }
          contentType = r.headers.get("content-type") || contentType;
          bytes = await r.arrayBuffer();
        } catch (e) {
          console.error("[zapi-bot] erro download:", e);
          return json({ ok: true, error: "download_excecao" });
        }

        // 6) Upload no Storage.
        const dataEnvio = body.momment || body.moment
          ? new Date((body.momment || body.moment) as number)
          : new Date();
        const dataPasta = ymd(dataEnvio);
        const fileName = `${messageId}.${ext(contentType)}`;
        const storagePath = `${enc.id}/${dataPasta}/${fileName}`;

        const { error: upErr } = await supabaseAdmin.storage
          .from(BUCKET)
          .upload(storagePath, new Uint8Array(bytes), {
            contentType,
            upsert: true,
          });
        if (upErr) {
          console.error("[zapi-bot] erro upload storage:", upErr);
          return json({ ok: true, error: "upload_falhou" });
        }

        // 7) Insert em fotos. Trigger enfileirar_analise_foto cria o job.
        const { data: inserted, error: insErr } = await supabaseAdmin
          .from("fotos")
          .insert({
            encarregado_id: enc.id,
            message_id: messageId,
            data_envio: dataEnvio.toISOString(),
            data_pasta: dataPasta,
            remetente_telefone: body.participantPhone || null,
            remetente_nome: body.senderName || null,
            storage_path: storagePath,
            caption: body.image.caption || null,
            mime_type: contentType,
            tamanho_bytes: bytes.byteLength,
            largura: body.image.width || null,
            altura: body.image.height || null,
            status: "processada",
          })
          .select("id")
          .single();

        if (insErr) {
          console.error("[zapi-bot] erro insert foto:", insErr);
          // remove o arquivo órfão
          await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch(() => {});
          return json({ ok: true, error: "insert_foto_falhou" });
        }

        // 8) Atualiza ultima_foto_em no grupo.
        await supabaseAdmin
          .from("grupos")
          .update({ ultima_foto_em: dataEnvio.toISOString() })
          .eq("whatsapp_jid", chatId);

        const kb = Math.round(bytes.byteLength / 1024);
        console.log(
          `[zapi-bot] Foto salva: ${enc.nome} / ${dataPasta} / ${messageId} (${kb} KB)`,
        );

        return json({ ok: true, id: inserted.id, storage_path: storagePath });
      },
    },
  },
});
