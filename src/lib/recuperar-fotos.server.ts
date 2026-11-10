// Recuperação automática de fotos que chegaram pelo webhook mas não foram
// salvas (falha ao baixar/subir). Chamada pelo endpoint recuperar-fotos
// (cron recuperar-fotos.yml). Só considera grupos vinculados a um encarregado ativo
// (grupos sem encarregado são ignorados de propósito).
// Limite de tentativas por mensagem: contador em eventos_raw.erro ("recuperacao:N").

import { chaveJid } from "@/lib/jid";

type Cliente = { from: (t: string) => any };

type Evento = {
  id: string;
  message_id: string | null;
  erro: string | null;
  tipo_evento: string | null;
  created_at: string;
};

// Mídias "[Undecryptable]" só ficam baixáveis depois que o celular da
// instância abre o WhatsApp e sincroniza as chaves — pode demorar. O cron
// recuperar-fotos.yml roda a cada ~15 min (07h–21h, o GitHub atrasa), então
// na prática as tentativas cobrem toda a janela de 24 h.
const MAX_TENTATIVAS = 60;

const tentativasFeitas = (erro: string | null) =>
  Number(/recuperacao:(\d+)/.exec(erro ?? "")?.[1] ?? 0);

export async function recuperarFotosFalhas(
  sb: Cliente,
  origem: string,
  limite = 5,
): Promise<{ tentadas: number; salvas: number }> {
  const token = process.env.UAZAPI_FOTOS_WEBHOOK_TOKEN;
  if (!token) return { tentadas: 0, salvas: 0 };

  const { data: encs } = await sb.from("encarregados").select("grupo_whatsapp_id").eq("ativo", true);
  // O encarregado pode ter o grupo gravado sem sufixo ou com "-group" (formato
  // antigo) e os eventos chegam com "@g.us": procura nos três formatos.
  const chaves = new Set(
    ((encs ?? []) as Array<{ grupo_whatsapp_id: string | null }>)
      .map((e) => chaveJid(e.grupo_whatsapp_id))
      .filter(Boolean),
  );
  if (chaves.size === 0) return { tentadas: 0, salvas: 0 };
  const jids = [...chaves].flatMap((c) => [c, `${c}@g.us`, `${c}-group`]);

  const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
  const ate = new Date(Date.now() - 3 * 60_000).toISOString(); // dá tempo do fluxo normal

  // Imagens do dia inteiro (são ~1000/dia; sem o payload, que é pesado).
  const imagens: Evento[] = [];
  for (let de = 0; de < 5000; de += 1000) {
    const { data } = await sb
      .from("eventos_raw")
      .select("id, message_id, erro, tipo_evento, created_at")
      .eq("tipo_evento", "image")
      .in("chat_id", jids)
      .gte("created_at", desde)
      .lte("created_at", ate)
      .order("created_at", { ascending: false })
      .range(de, de + 999);
    const lote = (data ?? []) as Evento[];
    imagens.push(...lote);
    if (lote.length < 1000) break;
  }

  // Eventos "error" só entram se forem mídia de imagem não descriptografada;
  // outros erros (texto corrompido etc.) não têm o que recuperar.
  const { data: errosDb } = await sb
    .from("eventos_raw")
    .select("id, message_id, erro, tipo_evento, created_at, payload")
    .eq("tipo_evento", "error")
    .in("chat_id", jids)
    .gte("created_at", desde)
    .lte("created_at", ate)
    .order("created_at", { ascending: false })
    .limit(500);
  const indecifraveis = ((errosDb ?? []) as Array<Evento & { payload: unknown }>).filter((e) => {
    const t = JSON.stringify(e.payload ?? "");
    return /\[undecryptable\]/i.test(t) && /\[image\]/i.test(t);
  });

  const lista: Evento[] = [...imagens, ...indecifraveis];
  const ids = [...new Set(lista.map((e) => e.message_id).filter((m): m is string => !!m))];
  if (ids.length === 0) return { tentadas: 0, salvas: 0 };

  const jaSalvas = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: salvasDb } = await sb
      .from("fotos")
      .select("message_id")
      .in("message_id", ids.slice(i, i + 200));
    for (const f of (salvasDb ?? []) as Array<{ message_id: string }>) jaSalvas.add(f.message_id);
  }

  const vistos = new Set<string>();
  const pendentes = lista
    .filter((e) => {
      if (!e.message_id || jaSalvas.has(e.message_id) || vistos.has(e.message_id)) return false;
      vistos.add(e.message_id);
      return tentativasFeitas(e.erro) < MAX_TENTATIVAS;
    })
    // Menos tentativas primeiro: uma foto que nunca baixa não trava as outras.
    .sort(
      (a, b) =>
        tentativasFeitas(a.erro) - tentativasFeitas(b.erro) ||
        b.created_at.localeCompare(a.created_at),
    );

  const escolhidos = pendentes.slice(0, limite);
  if (escolhidos.length === 0) return { tentadas: 0, salvas: 0 };
  const { data: comPayload } = await sb
    .from("eventos_raw")
    .select("id, payload")
    .in(
      "id",
      escolhidos.map((e) => e.id),
    );
  const payloads = new Map(
    ((comPayload ?? []) as Array<{ id: string; payload: unknown }>).map((e) => [e.id, e.payload]),
  );

  let salvas = 0;
  const url = `${origem.replace(/\/+$/, "")}/api/public/hooks/uazapi-fotos/${token}`;
  for (const e of escolhidos) {
    const n = tentativasFeitas(e.erro) + 1;
    let ok = false;
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-reprocessar": "1" },
        body: JSON.stringify(payloads.get(e.id) ?? {}),
      });
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      ok = Boolean(j.id);
    } catch {
      ok = false;
    }
    if (ok) salvas++;
    await sb
      .from("eventos_raw")
      .update({ erro: ok ? null : `recuperacao:${n}`, processado: ok })
      .eq("id", e.id);
  }
  return { tentadas: escolhidos.length, salvas };
}
