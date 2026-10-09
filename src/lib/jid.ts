/**
 * Mesmo grupo do WhatsApp pode estar gravado com "@g.us", "-group" ou sem
 * sufixo (formatos da Z-API antiga e da UazAPI). Para comparar, só a parte
 * que identifica o grupo — o mesmo critério do webhook de fotos.
 */
export const chaveJid = (jid: string | null | undefined) =>
  String(jid ?? "")
    .trim()
    .toLowerCase()
    .replace(/@g\.us$/, "")
    .replace(/@s\.whatsapp\.net$/, "")
    .replace(/-group$/, "");

/** minúsculas e sem acento: "ligação" acha "LIGAÇÃO" e "ligacao". */
export const semAcento = (t: string | null | undefined) =>
  String(t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
