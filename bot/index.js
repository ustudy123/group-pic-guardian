import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { rm } from "node:fs/promises";

const LOVABLE_API_URL = process.env.LOVABLE_API_URL;
const WHATSAPP_BOT_SECRET = process.env.WHATSAPP_BOT_SECRET;
const AUTH_DIR = process.env.AUTH_DIR || "/app/auth_info";
const FALLBACK_WA_VERSION = [2, 3000, 1028397221];
let authResetTried = false;

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

function parseVersion(version) {
  if (!version) return null;
  const parsed = version
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10));

  if (parsed.length !== 3 || parsed.some((part) => Number.isNaN(part))) {
    return null;
  }

  return parsed;
}

async function resolveWaVersion() {
  const envVersion = parseVersion(process.env.WA_VERSION);
  if (envVersion) {
    logger.info({ version: envVersion }, "Usando versão do WhatsApp Web definida por WA_VERSION");
    return envVersion;
  }

  try {
    const { version, isLatest } = await fetchLatestBaileysVersion();
    logger.info({ version, isLatest }, "Usando versão do WhatsApp Web detectada pelo Baileys");
    return version;
  } catch (err) {
    logger.warn(
      { err: String(err), version: FALLBACK_WA_VERSION },
      "Falha ao detectar versão do WhatsApp Web; usando fallback"
    );
    return FALLBACK_WA_VERSION;
  }
}

async function resetAuthState() {
  await rm(AUTH_DIR, { recursive: true, force: true });
  logger.warn({ authDir: AUTH_DIR }, "Sessão local removida para forçar novo QR");
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
        return { ok: true, json };
      }
      const text = await res.text();
      logger.warn({ status: res.status, text, attempt }, "falha no envio");
      if (res.status === 401 || res.status === 415) {
        return { ok: false, status: res.status, text };
      }
    } catch (err) {
      logger.error({ err: String(err), attempt }, "erro de rede");
    }
    await new Promise((r) => setTimeout(r, Math.min(30000, 1000 * 2 ** attempt)));
  }
  logger.error({ msg_id: meta.msg_id }, "desisti após 5 tentativas");
  return { ok: false, status: 0, text: "timeout após 5 tentativas" };
}

async function safeReply(sock, jid, quoted, text) {
  try {
    await sock.sendMessage(jid, { text }, { quoted });
  } catch (err) {
    logger.warn({ err: String(err) }, "falha ao enviar resposta de status");
  }
}

async function start() {
  logger.info({ authDir: AUTH_DIR }, "Iniciando bot do WhatsApp");
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const version = await resolveWaVersion();

  const sock = makeWASocket({
    auth: state,
    version,
    logger: pino({ level: "warn" }),
    printQRInTerminal: false,
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      logQrLink(qr);
    }
    if (connection === "open") {
      authResetTried = false;
      logger.info("Conectado ao WhatsApp.");
    }
    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect =
        statusCode !== DisconnectReason.loggedOut;
      logger.warn(
        {
          shouldReconnect,
          statusCode,
          hasRegisteredSession: Boolean(state.creds?.registered),
          error: lastDisconnect?.error?.message || String(lastDisconnect?.error || "unknown"),
        },
        "conexão fechada"
      );

      if (statusCode === 405 && !state.creds?.registered && !authResetTried) {
        authResetTried = true;
        logger.warn(
          "WhatsApp recusou a sessão antes do QR; limpando auth para forçar um pareamento novo"
        );
        await resetAuthState();
        setTimeout(start, 3000);
        return;
      }

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
