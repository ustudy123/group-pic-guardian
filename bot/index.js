import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcodeTerminal from "qrcode-terminal";
import { rm } from "node:fs/promises";

const LOVABLE_API_URL = process.env.LOVABLE_API_URL;
const WHATSAPP_BOT_SECRET = process.env.WHATSAPP_BOT_SECRET;
const AUTH_DIR = process.env.AUTH_DIR || "/app/auth_info";
const FALLBACK_WA_VERSION = [2, 3000, 1028397221];
const FORCE_WA_VERSION = [2, 2413, 51];
let authResetTried = false;
let lastForcedVersionKey = null;

if (!LOVABLE_API_URL || !WHATSAPP_BOT_SECRET) {
  console.error("Defina as variáveis LOVABLE_API_URL e WHATSAPP_BOT_SECRET");
  process.exit(1);
}

const INGEST_URL = `${LOVABLE_API_URL.replace(/\/$/, "")}/api/public/whatsapp/ingest`;
const STATUS_URL = `${LOVABLE_API_URL.replace(/\/$/, "")}/api/public/whatsapp/status`;
const logger = pino({ level: "info" });

function logQrLink(qr) {
  const link = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=20&data=${encodeURIComponent(qr)}`;
  logger.info({ qrLink: link }, "QR disponível para escanear");
  console.log(`QR LINK: ${link}`);
  qrcodeTerminal.generate(qr, { small: true });
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

  if (process.env.WA_LATEST === "1") {
    try {
      const { version, isLatest } = await fetchLatestBaileysVersion();
      logger.info({ version, isLatest }, "Usando versão do WhatsApp Web detectada pelo Baileys");
      return version;
    } catch (err) {
      logger.warn(
        { err: String(err), version: FORCE_WA_VERSION },
        "Falha ao detectar versão latest; usando versão compatível fixa"
      );
      return FORCE_WA_VERSION;
    }
  }

  if (process.env.WA_FORCE_COMPAT === "1") {
    logger.info({ version: FORCE_WA_VERSION }, "Usando versão compatível fixa do WhatsApp Web");
    return FORCE_WA_VERSION;
  }

  logger.info({ version: FORCE_WA_VERSION }, "Usando versão compatível fixa do WhatsApp Web por padrão");
  return FORCE_WA_VERSION;
}

async function resetAuthState() {
  await rm(AUTH_DIR, { recursive: true, force: true });
  logger.warn({ authDir: AUTH_DIR }, "Sessão local removida para forçar novo QR");
}

function sameVersion(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === 3 && b.length === 3 && a.every((part, idx) => part === b[idx]);
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

async function postStatus(payload) {
  try {
    const res = await fetch(STATUS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Bot-Secret": WHATSAPP_BOT_SECRET,
      },
      body: JSON.stringify({
        ...payload,
        last_event_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn({ status: res.status, text }, "falha ao publicar status do bot");
    }
  } catch (err) {
    logger.warn({ err: String(err) }, "erro ao publicar status do bot");
  }
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
  await postStatus({
    connection_status: "starting",
    qr_text: null,
    last_error: null,
  });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const version = await resolveWaVersion();
  const versionKey = version.join(".");

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger.child({ module: "signal-store" })),
    },
    version,
    logger: pino({ level: "warn" }),
    printQRInTerminal: false,
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      logQrLink(qr);
      await postStatus({
        connection_status: "qr_ready",
        qr_text: qr,
        last_error: null,
      });
    }
    if (connection === "open") {
      authResetTried = false;
      logger.info("Conectado ao WhatsApp.");
      await postStatus({
        connection_status: "connected",
        qr_text: null,
        last_error: null,
        phone_jid: sock.user?.id ?? null,
      });
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

      await postStatus({
        connection_status: statusCode === 401 || statusCode === 403 || statusCode === 405 ? "error" : "disconnected",
        qr_text: null,
        last_error: `status ${statusCode ?? "?"}: ${lastDisconnect?.error?.message || "Connection Failure"}`,
        phone_jid: sock.user?.id ?? null,
        meta: {
          statusCode: statusCode ?? null,
          shouldReconnect,
          hasRegisteredSession: Boolean(state.creds?.registered),
          version,
        },
      });

      if (
        (statusCode === 401 || statusCode === 403 || statusCode === 405) &&
        !state.creds?.registered &&
        !authResetTried &&
        !process.env.WA_VERSION &&
        !sameVersion(version, FORCE_WA_VERSION) &&
        lastForcedVersionKey !== versionKey
      ) {
        authResetTried = true;
        lastForcedVersionKey = versionKey;
        process.env.WA_VERSION = FORCE_WA_VERSION.join(",");
        logger.warn(
          { currentVersion: version, forcedVersion: FORCE_WA_VERSION },
          "WhatsApp recusou a sessão com 403 antes do pareamento; limpando auth e reiniciando com versão compatível"
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

        await safeReply(sock, remoteJid, m, "📥 Foto recebida, baixando...");

        const buffer = await downloadMediaMessage(m, "buffer", {}, { logger, reuploadRequest: sock.updateMediaMessage });
        if (!buffer) {
          await safeReply(sock, remoteJid, m, "⚠️ Não consegui baixar a imagem.");
          continue;
        }

        await safeReply(sock, remoteJid, m, `⬆️ Enviando para o servidor (${(buffer.length / 1024).toFixed(0)} KB)...`);

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

        const result = await postFoto({ buffer, mime: meta.mime_type, meta });
        if (result.ok) {
          await safeReply(sock, remoteJid, m, "✅ Foto processada com sucesso!");
        } else {
          await safeReply(
            sock,
            remoteJid,
            m,
            `❌ Falha ao enviar (status ${result.status || "?"}): ${String(result.text || "").slice(0, 200)}`
          );
        }
      } catch (err) {
        logger.error({ err: String(err) }, "erro processando mensagem");
      }
    }
  });
}

start().catch((err) => {
  void postStatus({
    connection_status: "error",
    qr_text: null,
    last_error: String(err),
  });
  logger.error({ err: String(err) }, "falha ao iniciar");
  process.exit(1);
});
