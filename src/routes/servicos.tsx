import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight, Loader2, LayoutGrid } from "lucide-react";
import { FORM_GRAD, FORM_GRAD_BTN, FORM_BG, FORM_SHADOW } from "@/lib/ui-form";

export const Route = createFileRoute("/servicos")({
  component: MenuServicos,
});

function MenuServicos() {
  const { data: servicos = [], isLoading } = useQuery({
    queryKey: ["menu-servicos"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("formularios") as any)
        .select("id, titulo, descricao, share_slug, menu_icone, menu_ordem")
        .eq("publico", true)
        .eq("status", "publicado")
        .eq("no_menu", true)
        .order("menu_ordem")
        .order("titulo");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  return (
    <div className="min-h-screen py-8 px-4" style={{ backgroundImage: FORM_BG }}>
      <div className="mx-auto max-w-2xl space-y-5">
        {/* Cabeçalho herói */}
        <div
          className="relative overflow-hidden rounded-3xl p-7 text-white"
          style={{ backgroundImage: FORM_GRAD, boxShadow: FORM_SHADOW }}
        >
          <div className="relative flex items-center gap-3">
            <LayoutGrid size={26} />
            <div>
              <h1 className="text-2xl font-bold">Selecione o serviço</h1>
              <p className="text-sm text-white/85">
                Escolha o tipo de serviço para abrir o formulário correto.
              </p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 size={18} className="animate-spin" /> Carregando serviços…
          </div>
        ) : servicos.length === 0 ? (
          <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-md">
            Nenhum serviço disponível no momento.
          </div>
        ) : (
          <div className="space-y-3">
            {servicos.map((s) => (
              <a
                key={s.id}
                href={`/f/${s.share_slug}`}
                className="group flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl text-white"
                  style={{ backgroundImage: FORM_GRAD_BTN }}
                >
                  {s.menu_icone || "📋"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{s.titulo}</div>
                  {s.descricao && (
                    <div className="text-sm text-muted-foreground line-clamp-2">{s.descricao}</div>
                  )}
                </div>
                <ChevronRight
                  size={20}
                  className="shrink-0 text-muted-foreground transition group-hover:translate-x-0.5"
                />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
