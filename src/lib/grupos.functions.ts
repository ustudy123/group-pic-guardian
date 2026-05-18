import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type ZapiChat = {
  phone?: string;
  name?: string;
  isGroup?: boolean;
};

export const sincronizarGruposZapi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const instanceId = process.env.ZAPI_INSTANCE_ID;
    const instanceToken = process.env.ZAPI_INSTANCE_TOKEN;
    const clientToken = process.env.ZAPI_CLIENT_TOKEN;

    if (!instanceId || !instanceToken || !clientToken) {
      throw new Error("Credenciais Z-API ausentes no servidor.");
    }

    const base = `https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/chats`;

    const grupos: { jid: string; nome: string }[] = [];
    const seen = new Set<string>();

    // Paginação defensiva: para no máximo 50 páginas
    for (let page = 1; page <= 50; page++) {
      const res = await fetch(`${base}?page=${page}&pageSize=100`, {
        headers: { "Client-Token": clientToken },
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Z-API respondeu ${res.status}: ${txt.slice(0, 200)}`);
      }

      const json = (await res.json()) as ZapiChat[] | { chats?: ZapiChat[] };
      const lista: ZapiChat[] = Array.isArray(json) ? json : (json.chats ?? []);

      if (lista.length === 0) break;

      for (const c of lista) {
        const jid = (c.phone ?? "").trim();
        if (!jid || !c.isGroup) continue;
        if (seen.has(jid)) continue;
        seen.add(jid);
        grupos.push({ jid, nome: (c.name ?? "").trim() || jid });
      }

      if (lista.length < 100) break;
    }

    if (grupos.length === 0) {
      return { criados: 0, atualizados: 0, total: 0 };
    }

    // Busca quais já existem para distinguir criados x atualizados
    const jids = grupos.map((g) => g.jid);
    const { data: existentes, error: selErr } = await supabaseAdmin
      .from("grupos")
      .select("whatsapp_jid")
      .in("whatsapp_jid", jids);
    if (selErr) throw selErr;

    const existSet = new Set((existentes ?? []).map((e) => e.whatsapp_jid));

    // Insere os novos com ativo=true
    const novos = grupos.filter((g) => !existSet.has(g.jid));
    if (novos.length > 0) {
      const { error: insErr } = await supabaseAdmin.from("grupos").insert(
        novos.map((g) => ({
          whatsapp_jid: g.jid,
          nome_exibicao: g.nome,
          ativo: true,
        })),
      );
      if (insErr) throw insErr;
    }

    // Atualiza nome_exibicao dos existentes (preserva ativo / ultima_foto_em)
    let atualizados = 0;
    for (const g of grupos) {
      if (!existSet.has(g.jid)) continue;
      const { error: upErr } = await supabaseAdmin
        .from("grupos")
        .update({ nome_exibicao: g.nome })
        .eq("whatsapp_jid", g.jid);
      if (!upErr) atualizados++;
    }

    return {
      criados: novos.length,
      atualizados,
      total: grupos.length,
    };
  });
