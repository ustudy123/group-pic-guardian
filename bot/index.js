import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";
import pino from "pino";

const LOVABLE_API_URL = process.env.LOVABLE_API_URL;
const WHATSAPP_BOT_SECRET = process.env.WHATSAPP_BOT_SECRET;
const AUTH_DIR = process.env.AUTH_DIR || "/app/auth_info";

if (!LOVABLE_API_URL || !WHATSAPP_BOT_SECRET) {
  console.error("Defina as variáveis LOVABLE_API_URL e WHATSAPP_BOT_SECRET");
  process.exit(1);
}

const INGEST_URL = `${LOVABLE_API_URL.replace(/\/$/, "")}/api/public/whatsapp/ingest`;
const logger = pino({ level: "info" });

function logQrLink(qr) {
  const link = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=20&data=${encodeURIComponent(qr)}`;
  logger.info({ qrLink: link }, "QR disponível para escanear");
  console.log(`QR LINK: ${link}`);
}

async function postFoto({ buffer, mime, meta }) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mime }), `${meta.msg_id}.jpg`);
  form.append("meta", JSON.stringify(meta));

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(INGEST_URL, {
        method: "POST",
        headers: { "X-Bot-Secret": WHATSAPP_BOT_SECRET },
        body: form,
      });
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        logger.info({ msg_id: meta.msg_id, ...json }, "foto enviada");
        return;
      }
      const text = await res.text();
      logger.warn({ status: res.status, text, attempt }, "falha no envio");
      if (res.status === 401 || res.status === 415) return; // não retentar
    } catch (err) {
      logger.error({ err: String(err), attempt }, "erro de rede");
    }
    await new Promise((r) => setTimeout(r, Math.min(30000, 1000 * 2 ** attempt)));
  }
  logger.error({ msg_id: meta.msg_id }, "desisti após 5 tentativas");
}

async function start() {
  logger.info({ authDir: AUTH_DIR }, "Iniciando bot do WhatsApp");
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "warn" }),
    printQRInTerminal: false,
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      logQrLink(qr);
    }
    if (connection === "open") {
      logger.info("Conectado ao WhatsApp.");
    }
    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      logger.warn(
        {
          shouldReconnect,
          statusCode: lastDisconnect?.error?.output?.statusCode,
          error: lastDisconnect?.error?.message || String(lastDisconnect?.error || "unknown"),
        },
        "conexão fechada"
      );
      if (shouldReconnect) setTimeout(start, 3000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const m of messages) {
      try {
        if (!m.message) continue;
        const remoteJid = m.key.remoteJid || "";
        if (!remoteJid.endsWith("@g.us")) continue; // só grupos

        const imageMsg =
          m.message.imageMessage ||
          m.message.ephemeralMessage?.message?.imageMessage ||
          m.message.viewOnceMessageV2?.message?.imageMessage ||
          m.message.viewOnceMessage?.message?.imageMessage;
        if (!imageMsg) continue;

        const buffer = await downloadMediaMessage(m, "buffer", {}, { logger, reuploadRequest: sock.updateMediaMessage });
        if (!buffer) continue;

        let groupName = remoteJid;
        try {
          const md = await sock.groupMetadata(remoteJid);
          groupName = md.subject || remoteJid;
        } catch {
          /* ignore */
        }

        const meta = {
          group_jid: remoteJid,
          group_name: groupName,
          sender_jid: m.key.participant || m.participant || null,
          sender_name: m.pushName || null,
          caption: imageMsg.caption || null,
          msg_id: m.key.id,
          timestamp: Number(m.messageTimestamp) || Math.floor(Date.now() / 1000),
          mime_type: imageMsg.mimetype || "image/jpeg",
        };

        await postFoto({ buffer, mime: meta.mime_type, meta });
      } catch (err) {
        logger.error({ err: String(err) }, "erro processando mensagem");
      }
    }
  });
}

start().catch((err) => {
  logger.error({ err: String(err) }, "falha ao iniciar");
  process.exit(1);
});
