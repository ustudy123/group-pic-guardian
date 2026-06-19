import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// === Autenticação reutilizada ===
async function getAuthContext() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Configuração do Supabase ausente no servidor.");
  }

  const request = getRequest();
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Unauthorized");
  }

  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    throw new Error("Unauthorized");
  }

  return { supabase, userId: data.claims.sub };
}

type UazapiGroup = {
  JID?: string;
  jid?: string;
  Name?: string;
  name?: string;
  Subject?: string;
  subject?: string;
};

/**
 * Sincroniza a lista de grupos do WhatsApp consultando diretamente a UazAPI
 * da instância conectada (UAZAPI_INSTANCE_TOKEN). Cria novos registros em
 * public.grupos e atualiza o nome_exibicao dos já existentes.
 */
export const sincronizarGruposZapi = createServerFn({ method: "POST" })
  .handler(async () => {
    const { supabase } = await getAuthContext();

    const baseUrl = (process.env.UAZAPI_BASE_URL || "https://api.uazapi.com").replace(/\/+$/, "");
    const token = process.env.UAZAPI_INSTANCE_TOKEN;
    if (!token) {
      throw new Error("UAZAPI_INSTANCE_TOKEN ausente no servidor.");
    }

    const res = await fetch(`${baseUrl}/group/list`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`UazAPI /group/list respondeu ${res.status}: ${txt.slice(0, 200)}`);
    }

    const json = (await res.json()) as { groups?: UazapiGroup[] } | UazapiGroup[];
    const lista: UazapiGroup[] = Array.isArray(json) ? json : (json.groups ?? []);

    const grupos: { jid: string; nome: string }[] = [];
    const seen = new Set<string>();
    for (const g of lista) {
      const jid = (g.JID || g.jid || "").trim();
      if (!jid) continue;
      if (seen.has(jid)) continue;
      seen.add(jid);
      const nome = (g.Name || g.name || g.Subject || g.subject || "").trim() || jid;
      grupos.push({ jid, nome });
    }

    if (grupos.length === 0) {
      return { criados: 0, atualizados: 0, total: 0 };
    }

    const jids = grupos.map((g) => g.jid);
    const { data: existentes, error: selErr } = await supabase
      .from("grupos")
      .select("whatsapp_jid")
      .in("whatsapp_jid", jids);
    if (selErr) throw new Error(`Erro ao consultar grupos: ${selErr.message}`);

    const existSet = new Set((existentes ?? []).map((e) => e.whatsapp_jid));

    const novos = grupos.filter((g) => !existSet.has(g.jid));
    if (novos.length > 0) {
      const { error: insErr } = await supabase.from("grupos").insert(
        novos.map((g) => ({
          whatsapp_jid: g.jid,
          nome_exibicao: g.nome,
          ativo: true,
        })),
      );
      if (insErr) throw new Error(`Erro ao inserir grupos: ${insErr.message}`);
    }

    let atualizados = 0;
    for (const g of grupos) {
      if (!existSet.has(g.jid)) continue;
      const { error: upErr } = await supabase
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

/**
 * Verifica se a instância UazAPI conectada está online.
 */
export const verificarStatusZapi = createServerFn({ method: "GET" }).handler(
  async () => {
    const baseUrl = (process.env.UAZAPI_BASE_URL || "https://api.uazapi.com").replace(/\/+$/, "");
    const token = process.env.UAZAPI_INSTANCE_TOKEN;
    if (!token) {
      return { connected: false, error: "UAZAPI_INSTANCE_TOKEN ausente" };
    }

    try {
      const res = await fetch(`${baseUrl}/instance/status`, {
        headers: { token },
      });
      if (!res.ok) {
        return { connected: false, error: `UazAPI ${res.status}` };
      }
      const json = (await res.json()) as {
        status?: { connected?: boolean; loggedIn?: boolean };
        instance?: { status?: string };
      };
      const connected =
        Boolean(json.status?.connected) ||
        Boolean(json.status?.loggedIn) ||
        json.instance?.status === "connected";
      return { connected, error: null };
    } catch (e) {
      return { connected: false, error: e instanceof Error ? e.message : "Erro desconhecido" };
    }
  },
);
