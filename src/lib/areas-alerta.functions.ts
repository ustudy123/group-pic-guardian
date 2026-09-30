import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { lerAreasAlerta, salvarAreasAlerta, type ConfigAreas } from "@/lib/areas-alerta";

// Mesmas pessoas que veem o menu Macro I.A (e admin/analista).
const EMAILS_MACRO_IA = ["wallasmonteiro019@gmail.com", "arthur.freitas@macroambiental.eng.br"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertPodeEditar(supabase: any, userId: string) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((roles ?? []).some((r: any) => r.role === "admin" || r.role === "analista")) return;
  const { data } = await supabase.auth.getUser();
  if (data?.user?.email && EMAILS_MACRO_IA.includes(data.user.email)) return;
  throw new Error("Sem permissão.");
}

const destinatario = z.object({
  nome: z.string().max(120),
  telefone: z.string().max(30),
});

const esquema = z.object({
  ativo: z.boolean(),
  areas: z
    .array(
      z.object({
        id: z.string().min(1).max(60),
        nome: z.string().min(1).max(120),
        modo: z.enum(["todos", "lista", "todos_exceto"]),
        encarregados: z.array(z.string().max(30)).max(500),
        destinatarios: z.array(destinatario).max(50),
      }),
    )
    .max(50),
});

export const obterAreasAlerta = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPodeEditar(context.supabase, context.userId);
    const cfg = await lerAreasAlerta(supabaseAdmin);
    return { config: cfg as ConfigAreas | null };
  });

export const gravarAreasAlerta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => esquema.parse(i))
  .handler(async ({ data, context }) => {
    await assertPodeEditar(context.supabase, context.userId);
    await salvarAreasAlerta(supabaseAdmin, data);
    return { ok: true };
  });
