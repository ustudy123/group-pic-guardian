import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { pushParaUsuario } from "@/lib/web-push.server";

/**
 * Dispara push imediato para os encarregados donos das fotos reprovadas
 * (chamado pelo painel Qualidade logo após a reprovação). O aviso agrupado
 * por WhatsApp continua saindo pelo cron — este é o alerta instantâneo no
 * aplicativo instalado (PWA).
 */
export const avisarPushReprovacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ fotoIds: z.array(z.string().uuid()).min(1).max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Só quem avalia (admin/analista) pode disparar
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["admin", "analista"]);
    if (!roles?.length) throw new Error("Acesso negado.");

    const { data: fotos } = await supabaseAdmin
      .from("fotos")
      .select("encarregado_id")
      .in("id", data.fotoIds);
    const encIds = [...new Set((fotos ?? []).map((f) => f.encarregado_id).filter(Boolean))];
    if (!encIds.length) return { notificados: 0 };

    const { data: encs } = await supabaseAdmin
      .from("encarregados")
      .select("user_id")
      .in("id", encIds)
      .not("user_id", "is", null);

    let notificados = 0;
    for (const e of encs ?? []) {
      const { enviados } = await pushParaUsuario(e.user_id as string);
      if (enviados > 0) notificados++;
    }
    return { notificados };
  });
