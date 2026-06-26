import { createFileRoute } from "@tanstack/react-router";
import type { Json } from "@/integrations/supabase/types";

// Webhook UazAPI — recebe fotos de grupos do WhatsApp.
// Substitui o worker Railway. URL pública:
//   POST /api/public/hooks/uazapi-fotos/{TOKEN}
// onde {TOKEN} === process.env.UAZAPI_FOTOS_WEBHOOK_TOKEN.

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

type AnyRec = Record<string, unknown>;

function asRecord(value: unknown): AnyRec | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as AnyRec)
    : undefined;
}

function ext(mime?: string): string {
  if (!mime) return "jpeg";
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  return "jpeg";
}

function ymd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// Normaliza um JID de grupo removendo sufixos opcionais ("@g.us", "-group",
// "@s.whatsapp.net") e espaços, preservando a parte única que identifica o
// grupo (ex.: "120363xxx" ou "5527997215836-1614003130"). NUNCA truncar só
// o prefixo numérico — grupos legados compartilham o mesmo prefixo antes do
// hífen e isso causaria mistura de fotos entre encarregados diferentes.
function jidNumero(s: string | null | undefined): string {
  if (!s) return "";
  let v = String(s).trim().toLowerCase();
  v = v.replace(/@g\.us$/, "");
  v = v.replace(/@s\.whatsapp\.net$/, "");
  v = v.replace(/-group$/, "");
  return v;
}

function pick<T = unknown>(obj: AnyRec | undefined, ...keys: string[]): T | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v as T;
  }
  return undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function onlyDigits(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

function isMacroIaOwner(body: AnyRec, d: AnyRec, chat: AnyRec | undefined): boolean {
  const owner = onlyDigits(
    pick<string>(d, "owner") ||
      pick<string>(body, "owner") ||
      pick<string>(chat, "owner") ||
      "",
  );
  return owner === "5527996228530";
}

function isEncryptedWhatsappUrl(url: string): boolean {
  return url.includes("mmg.whatsapp.net") || url.includes(".enc?") || url.endsWith(".enc");
}

async function baixarUrl(url: string, fallbackMime: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download_url_${r.status}`);
  return {
    bytes: new Uint8Array(await r.arrayBuffer()),
    contentType: r.headers.get("content-type") || fallbackMime,
  };
}

async function baixarMidiaUazapi(messageId: string, fallbackMime: string) {
  const baseUrl = (process.env.UAZAPI_BASE_URL || "https://api.uazapi.com").replace(/\/+$/, "");
  const token = process.env.UAZAPI_INSTANCE_TOKEN;
  if (!token) throw new Error("UAZAPI_INSTANCE_TOKEN ausente");

  const r = await fetch(`${baseUrl}/message/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify({ id: messageId }),
  });
  if (!r.ok) throw new Error(`uazapi_download_${r.status}`);

  const payload = (await r.json()) as AnyRec;
  const fileUrl = text(
    pick<string>(payload, "fileURL", "fileUrl", "url", "URL", "mediaUrl", "downloadUrl"),
  );
  if (!fileUrl) throw new Error("uazapi_download_sem_url");

  const mime = text(pick<string>(payload, "mimetype", "mimeType", "mime")) || fallbackMime;
  return baixarUrl(fileUrl, mime);
}

export const Route = createFileRoute("/api/public/hooks/uazapi-fotos/$token")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request, params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const expected = process.env.UAZAPI_FOTOS_WEBHOOK_TOKEN;
        if (!expected) {
          console.error("[uazapi-fotos] UAZAPI_FOTOS_WEBHOOK_TOKEN não configurado");
          return json({ error: "token_nao_configurado" }, 503);
        }
        if (params.token !== expected) {
          console.warn("[uazapi-fotos] token inválido");
          return json({ error: "forbidden" }, 403);
        }

        let body: AnyRec;
        try {
          body = (await request.json()) as AnyRec;
        } catch {
          return json({ ok: true, ignored: "json_invalido" });
        }

        // UazAPI envia em body.data (padrão) — alguns proxies em body.message
        const d = asRecord(body.data) || asRecord(body.message) || body;
        const chat = asRecord(d.chat) || asRecord(body.chat);
        const content = asRecord(d.content);

        const chatId = String(
          pick<string>(d, "chatid", "chatId", "chat_id", "remoteJid", "from") ||
            pick<string>(chat, "wa_chatid") ||
            "",
        );
        const messageId = String(
          pick<string>(d, "messageid", "messageId", "id", "key_id", "key") || "",
        );
        const isGroup =
          Boolean(pick<boolean>(d, "isGroup", "fromGroup")) ||
          Boolean(pick<boolean>(chat, "wa_isGroup")) ||
          chatId.includes("@g.us") ||
          chatId.endsWith("-group");
        const fromMe = Boolean(pick<boolean>(d, "fromMe", "wasSentByApi"));
        const messageType = String(
          pick<string>(d, "messageType", "type", "msgType") || "",
        ).toLowerCase();
        const mediaType = String(pick<string>(d, "mediaType") || "").toLowerCase();
        const contentMime = String(pick<string>(content, "mimetype", "mimeType", "mime") || "").toLowerCase();

        // === Auditoria: sempre grava em eventos_raw ===
        const tipoEvento =
          messageType.includes("image") || mediaType === "image" || contentMime.includes("image") || d.image
            ? "image"
            : messageType || "message";
        try {
          await supabaseAdmin.from("eventos_raw").insert({
            tipo_evento: tipoEvento,
            chat_id: chatId || null,
            message_id: messageId || null,
            payload: body as unknown as Json,
            processado: false,
          });
        } catch (e) {
          console.error("[uazapi-fotos] erro insert eventos_raw:", e);
        }

        const privateTextForMacroIa =
          isMacroIaOwner(body, d, chat) &&
          !isGroup &&
          !fromMe &&
          (messageType.includes("conversation") || messageType === "text" || messageType === "message") &&
          Boolean(text(pick<string>(d, "text", "content", "message", "body")));

        if (privateTextForMacroIa) {
          const url = new URL(request.url);
          const botUrl = `${url.origin}/api/public/hooks/uazapi-bot`;
          const botHeaders: Record<string, string> = { "Content-Type": "application/json" };
          const botToken = process.env.UAZAPI_BOT_WEBHOOK_TOKEN;
          if (botToken) botHeaders.Authorization = `Bearer ${botToken}`;

          try {
            const forwarded = await fetch(botUrl, {
              method: "POST",
              headers: botHeaders,
              body: JSON.stringify(body),
            });
            if (!forwarded.ok) {
              console.error(`[uazapi-fotos] forward Macro I.A. falhou ${forwarded.status}`);
            }
            return json({ ok: true, forwarded: "macro_ia", status: forwarded.status });
          } catch (e) {
            console.error("[uazapi-fotos] erro forward Macro I.A.:", e);
            return json({ ok: true, error: "forward_macro_ia" });
          }
        }

        const isImage =
          messageType.includes("image") ||
          mediaType === "image" ||
          contentMime.includes("image") ||
          Boolean(d.image) ||
          Boolean(pick(d, "imageMessage")) ||
          tipoEvento === "image";

        if (!isImage) {
          return json({ ok: true, ignored: "nao_eh_imagem" });
        }
        if (!isGroup) {
          return json({ ok: true, ignored: "nao_eh_grupo" });
        }
        if (fromMe) {
          return json({ ok: true, ignored: "enviada_por_mim" });
        }
        if (!chatId || !messageId) {
          return json({ ok: true, ignored: "sem_chat_ou_message_id" });
        }

        // === Procura encarregado pelo JID do grupo ===
        // Tenta match exato primeiro; se falhar, casa pelos dígitos.
        const numero = jidNumero(chatId);
        let enc: { id: string; nome: string; grupo_whatsapp_id: string } | null = null;

        const { data: encExato } = await supabaseAdmin
          .from("encarregados")
          .select("id, nome, grupo_whatsapp_id")
          .eq("grupo_whatsapp_id", chatId)
          .eq("ativo", true)
          .maybeSingle();
        enc = encExato ?? null;

        if (!enc && numero) {
          const { data: todos } = await supabaseAdmin
            .from("encarregados")
            .select("id, nome, grupo_whatsapp_id")
            .eq("ativo", true);
          enc = (todos ?? []).find((e) => jidNumero(e.grupo_whatsapp_id) === numero) ?? null;
        }

        if (!enc) {
          const chatName = String(
            pick<string>(body, "chatName") ||
              pick<string>(d, "chatName", "senderName", "pushName") ||
              "?",
          );
          console.warn(`[uazapi-fotos] Grupo ${chatId} (${chatName}) não cadastrado`);
          return json({ ok: true, ignored: "grupo_nao_cadastrado" });
        }

        // === Idempotência ===
        const { data: existente } = await supabaseAdmin
          .from("fotos")
          .select("id")
          .eq("message_id", messageId)
          .maybeSingle();
        if (existente) {
          return json({ ok: true, ignored: "ja_processada", id: existente.id });
        }

        // === Localiza payload da imagem ===
        const img =
          asRecord(d.image) ||
          (pick<AnyRec>(d, "imageMessage")) ||
          content ||
          ({} as AnyRec);

        const imageUrl = text(
          pick<string>(img, "url", "URL", "imageUrl", "mediaUrl", "downloadUrl", "fileURL") ||
            pick<string>(d, "mediaUrl", "fileUrl", "content") ||
            "",
        );
        const imageBase64 = text(
          pick<string>(img, "base64", "data") ||
            pick<string>(d, "base64", "fileBase64") ||
            "",
        );
        const caption = text(
          pick<string>(img, "caption") ||
            pick<string>(d, "caption", "text", "content") ||
            "",
        ) || null;
        const mimeHint = text(
          pick<string>(img, "mimetype", "mimeType", "mime") ||
            pick<string>(d, "mimetype", "mimeType") ||
            "image/jpeg",
        );
        const width = Number(pick(img, "width") || pick(d, "width") || 0) || null;
        const height = Number(pick(img, "height") || pick(d, "height") || 0) || null;

        // === Carrega bytes ===
        let bytes: Uint8Array;
        let contentType = mimeHint;

        try {
          if (imageBase64) {
            const clean = imageBase64.replace(/^data:[^;]+;base64,/, "");
            const bin = atob(clean);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            bytes = arr;
          } else if (imageUrl) {
            const baixada = isEncryptedWhatsappUrl(imageUrl)
              ? await baixarMidiaUazapi(messageId, contentType)
              : await baixarUrl(imageUrl, contentType);
            bytes = baixada.bytes;
            contentType = baixada.contentType;
          } else {
            const baixada = await baixarMidiaUazapi(messageId, contentType);
            bytes = baixada.bytes;
            contentType = baixada.contentType;
          }
        } catch (e) {
          console.error("[uazapi-fotos] erro baixando imagem:", e);
          return json({ ok: true, error: "download_excecao" });
        }

        // === Upload Storage ===
        const tsRaw =
          pick<number | string>(d, "messageTimestamp", "timestamp", "momment", "moment") ||
          pick<number | string>(body, "momment", "moment");
        let dataEnvio = new Date();
        if (tsRaw) {
          const n = Number(tsRaw);
          if (!Number.isNaN(n) && n > 0) {
            dataEnvio = new Date(n > 1e12 ? n : n * 1000);
          }
        }
        const dataPasta = ymd(dataEnvio);
        const fileName = `${messageId}.${ext(contentType)}`;
        const storagePath = `${enc.id}/${dataPasta}/${fileName}`;

        const { error: upErr } = await supabaseAdmin.storage
          .from(BUCKET)
          .upload(storagePath, bytes, { contentType, upsert: true });
        if (upErr) {
          console.error("[uazapi-fotos] erro upload storage:", upErr);
          return json({ ok: true, error: "upload_falhou" });
        }

        // Cria URL assinada de 10 anos para preview no painel
        let signedUrl: string | null = null;
        const { data: signed, error: signErr } = await supabaseAdmin.storage
          .from(BUCKET)
          .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10);
        if (signErr) {
          console.error("[uazapi-fotos] erro createSignedUrl:", signErr);
        } else {
          signedUrl = signed?.signedUrl ?? null;
        }

        // === Insert em fotos (trigger enfileirar_analise_foto cria o job) ===
        const senderTel = String(
          pick<string>(d, "participantPhone", "sender_pn", "sender", "participant", "from") || "",
        ).replace(/@.*/, "") || null;
        const senderNome = String(
          pick<string>(d, "senderName", "pushName", "notifyName") || "",
        ) || null;

        const { data: inserted, error: insErr } = await supabaseAdmin
          .from("fotos")
          .insert({
            encarregado_id: enc.id,
            message_id: messageId,
            data_envio: dataEnvio.toISOString(),
            data_pasta: dataPasta,
            remetente_telefone: senderTel,
            remetente_nome: senderNome,
            storage_path: storagePath,
            storage_url: signedUrl,
            caption,
            mime_type: contentType,
            tamanho_bytes: bytes.byteLength,
            largura: width,
            altura: height,
            status: "processada",
          })
          .select("id")
          .single();


        if (insErr) {
          console.error("[uazapi-fotos] erro insert foto:", insErr);
          await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch(() => {});
          return json({ ok: true, error: "insert_foto_falhou" });
        }

        // === Atualiza ultima_foto_em no grupo ===
        await supabaseAdmin
          .from("grupos")
          .update({ ultima_foto_em: dataEnvio.toISOString() })
          .eq("whatsapp_jid", enc.grupo_whatsapp_id);

        const kb = Math.round(bytes.byteLength / 1024);
        console.log(
          `[uazapi-fotos] Foto salva: ${enc.nome} / ${dataPasta} / ${messageId} (${kb} KB)`,
        );

        return json({ ok: true, id: inserted.id, storage_path: storagePath });
      },
    },
  },
});
