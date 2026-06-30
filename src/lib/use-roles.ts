import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

/**
 * Papéis do usuário logado.
 * Convenção neste app: o papel de "Qualidade" (quem gerencia formulários e listas)
 * é representado pelo papel `analista`. Admin sempre pode gerenciar.
 */
export function useRoles() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["meus-papeis", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.role as string);
    },
  });

  const roles = q.data ?? [];
  const isAdmin = roles.includes("admin");
  const isQualidade = roles.includes("analista");
  return {
    roles,
    loading: q.isLoading,
    isAdmin,
    isQualidade,
    podeGerenciarFormularios: isAdmin || isQualidade,
  };
}
