// Recuperação automática de fotos que chegaram pelo webhook mas não foram
// salvas (falha ao baixar/subir). Roda a cada execução do cron
// processar-analises. Só considera grupos vinculados a um encarregado ativo
// (grupos sem encarregado são ignorados de propósito).
// Limite de tentativas por mensagem: contador em eventos_raw.erro ("recuperacao:N").

type Cliente = { from: (t: string) => any };

const MAX_TENTATIVAS = 8;

export async function recuperarFotosFalhas(
  sb: Cliente,
  origem: string,
  limite = 5,
): Promise<{ tentadas: number; salvas: number }> {
  const token = process.env.UAZAPI_FOTOS_WEBHOOK_TOKEN;
  if (!token) return { tentadas: 0, salvas: 0 };

  const { data: encs } = await sb.from("encarregados").select("grupo_whatsapp_id").eq("ativo", true);
  const jids = ((encs ?? []) as Array<{ grupo_whatsapp_id: string }>)
    .map((e) => e.grupo_whatsapp_id)
    .filter(Boolean);
  if (jids.length === 0) return { tentadas: 0, salvas: 0 };

  const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
  const ate = new Date(Date.now() - 3 * 60_000).toISOString(); // dá tempo do fluxo normal
  const { data: eventos } = await sb
    .from("eventos_raw")
    .select("id, message_id, payload, erro")
    .eq("tipo_evento", "image")
    .in("chat_id", jids)
    .gte("created_at", desde)
    .lte("created_at", ate)
    .order("created_at", { ascending: false })
    .limit(300);

  const lista = (eventos ?? []) as Array<{ id: string; message_id: string | null; payload: unknown; erro: string | null }>;
  const ids = [...new Set(lista.map((e) => e.message_id).filter((m): m is string => !!m))];
  if (ids.length === 0) return { tentadas: 0, salvas: 0 };

  const { data: salvasDb } = await sb.from("fotos").select("message_id").in("message_id", ids);
  const jaSalvas = new Set(((salvasDb ?? []) as Array<{ message_id: string }>).map((f) => f.message_id));

  const vistos = new Set<string>();
  const pendentes = lista.filter((e) => {
    if (!e.message_id || jaSalvas.has(e.message_id) || vistos.has(e.message_id)) return false;
    vistos.add(e.message_id);
    const n = Number(/recuperacao:(\d+)/.exec(e.erro ?? "")?.[1] ?? 0);
    return n < MAX_TENTATIVAS;
  });

  let salvas = 0;
  const url = `${origem.replace(/\/+$/, "")}/api/public/hooks/uazapi-fotos/${token}`;
  for (const e of pendentes.slice(0, limite)) {
    const n = Number(/recuperacao:(\d+)/.exec(e.erro ?? "")?.[1] ?? 0) + 1;
    let ok = false;
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-reprocessar": "1" },
        body: JSON.stringify(e.payload),
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
  return { tentadas: Math.min(pendentes.length, limite), salvas };
}
