// Grupos do WhatsApp da instância de fotos (UazAPI) e recuperação de fotos.
//
// - listarGruposUazapi: a UazAPI devolve /group/list paginado (50 por vez);
//   antes só líamos a 1ª página e 34 dos 84 grupos nunca apareciam.
// - nomeDoGrupo: o nome do GRUPO vem em chat.name / groupName. senderName e
//   pushName são de QUEM mandou — usar isso fez o grupo "Fotos obra-
//   Calçamento" ser cadastrado como "Deus No Controle" e o "PENDENCIAS DE
//   LIGAÇÃO" como "Rayelle - Setor de RFO" (09/10).
// - reprocessarFotosDoGrupo: fotos que chegaram antes de o grupo ser ativado
//   ficam guardadas em eventos_raw; reenviamos ao webhook para salvá-las.

type AnyRec = Record<string, unknown>;

const asRec = (v: unknown): AnyRec | undefined =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as AnyRec) : undefined;
const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Nome do grupo no payload do webhook (nunca o nome de quem mandou). */
export function nomeDoGrupo(body: AnyRec): string {
  const d = asRec(body.data) || asRec(body.message) || body;
  const chat = asRec(d.chat) || asRec(body.chat);
  return (
    txt(chat?.name) ||
    txt(chat?.wa_name) ||
    txt(d.groupName) ||
    txt(body.groupName) ||
    txt(d.chatName) ||
    txt(body.chatName) ||
    ""
  );
}

export type GrupoUazapi = { jid: string; nome: string };

export async function listarGruposUazapi(): Promise<GrupoUazapi[]> {
  const baseUrl = (process.env.UAZAPI_BASE_URL || "https://api.uazapi.com").replace(/\/+$/, "");
  const token = process.env.UAZAPI_INSTANCE_TOKEN;
  if (!token) throw new Error("UAZAPI_INSTANCE_TOKEN ausente no servidor.");

  const grupos: GrupoUazapi[] = [];
  const vistos = new Set<string>();
  const LIMITE = 50;
  for (let offset = 0, pagina = 0; pagina < 40; pagina++, offset += LIMITE) {
    const r = await fetch(`${baseUrl}/group/list`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ force: pagina === 0, limit: LIMITE, offset }),
    });
    if (!r.ok) {
      if (pagina === 0) {
        const t = await r.text().catch(() => "");
        throw new Error(`UazAPI /group/list respondeu ${r.status}: ${t.slice(0, 200)}`);
      }
      break;
    }
    const j = (await r.json()) as AnyRec | AnyRec[];
    const lista = (Array.isArray(j) ? j : ((j.groups ?? j.data ?? []) as AnyRec[])) as AnyRec[];
    let novos = 0;
    for (const g of lista) {
      const jid = txt(g.JID) || txt(g.jid);
      if (!jid || vistos.has(jid)) continue;
      vistos.add(jid);
      novos++;
      grupos.push({ jid, nome: txt(g.Name) || txt(g.name) || txt(g.Subject) || txt(g.subject) || jid });
    }
    const pag = Array.isArray(j) ? undefined : asRec(j.pagination);
    const total = Number(pag?.totalRecords ?? pag?.total ?? 0);
    // Sem paginação na resposta, página repetida ou acabou: para.
    if (!pag || novos === 0 || lista.length < LIMITE || (total && grupos.length >= total)) break;
  }
  return grupos;
}

type Cliente = { from: (t: string) => any };

/**
 * Reenvia ao webhook as imagens deste grupo guardadas em eventos_raw (a
 * gravação é idempotente pelo message_id: o que já foi salvo não duplica).
 */
export async function reprocessarFotosDoGrupo(
  sb: Cliente,
  jid: string,
  origem: string,
  opcoes: { dias?: number; maximo?: number } = {},
): Promise<{ encontradas: number; salvas: number; ja_existiam: number; falhas: number; restantes: number }> {
  const token = process.env.UAZAPI_FOTOS_WEBHOOK_TOKEN;
  if (!token) throw new Error("UAZAPI_FOTOS_WEBHOOK_TOKEN ausente no servidor.");
  const dias = Math.min(Math.max(opcoes.dias ?? 7, 1), 30);
  const maximo = Math.min(Math.max(opcoes.maximo ?? 40, 1), 100);
  const desde = new Date(Date.now() - dias * 24 * 3600_000).toISOString();

  const { data } = await sb
    .from("eventos_raw")
    .select("message_id, payload, created_at")
    .eq("chat_id", jid)
    .eq("tipo_evento", "image")
    .gte("created_at", desde)
    .order("created_at", { ascending: true })
    .limit(500);
  // Uma vez por mensagem (o mesmo webhook pode ter chegado mais de uma vez).
  const porMensagem = new Map<string, AnyRec>();
  for (const e of (data ?? []) as Array<{ message_id: string | null; payload: AnyRec }>) {
    if (e.message_id && !porMensagem.has(e.message_id)) porMensagem.set(e.message_id, e.payload);
  }
  const fila = [...porMensagem.values()];
  const agora = fila.slice(0, maximo);

  let salvas = 0;
  let jaExistiam = 0;
  let falhas = 0;
  const url = `${origem.replace(/\/+$/, "")}/api/public/hooks/uazapi-fotos/${token}`;
  for (const payload of agora) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-reprocessar": "1" },
        body: JSON.stringify(payload),
      });
      const j = (await r.json().catch(() => ({}))) as AnyRec;
      if (j.ignored === "ja_processada") jaExistiam++;
      else if (j.id) salvas++;
      else falhas++;
    } catch {
      falhas++;
    }
  }
  return {
    encontradas: fila.length,
    salvas,
    ja_existiam: jaExistiam,
    falhas,
    restantes: Math.max(0, fila.length - agora.length),
  };
}
