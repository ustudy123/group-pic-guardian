import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMinhasRuas } from "@/lib/vistorias.functions";
import { MapPin, ChevronRight, FileText, Camera, Inbox } from "lucide-react";

export const Route = createFileRoute("/painel/vistorias/")({
  component: MinhasVistorias,
});

function MinhasVistorias() {
  const fn = useServerFn(listMinhasRuas);
  const { data, isLoading } = useQuery({
    queryKey: ["minhas-ruas"],
    queryFn: () => fn(),
  });

  if (isLoading) {
    return (
      <div className="grid gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 rounded-xl border bg-card animate-pulse" />
        ))}
      </div>
    );
  }
  const ruas = (data?.ruas ?? []) as any[];

  if (ruas.length === 0) {
    return (
      <div className="text-center py-16 border rounded-2xl bg-card space-y-3">
        <div className="mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <Inbox className="text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold">Nenhuma rua atribuída</h2>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Peça ao administrador para atribuir ruas a você na aba <strong>Cadastros</strong>.
        </p>
      </div>
    );
  }

  // Agrupa por contrato → bairro
  const grupos = new Map<string, { descricao?: string; bairros: Map<string, any[]> }>();
  for (const r of ruas) {
    const contrato = r.bairros?.contratos?.numero ?? "Sem contrato";
    const descricao = r.bairros?.contratos?.descricao ?? "";
    const bairro = r.bairros?.nome ?? "Sem bairro";
    if (!grupos.has(contrato)) grupos.set(contrato, { descricao, bairros: new Map() });
    const sub = grupos.get(contrato)!.bairros;
    if (!sub.has(bairro)) sub.set(bairro, []);
    sub.get(bairro)!.push(r);
  }

  return (
    <div className="space-y-8">
      {Array.from(grupos.entries()).map(([contrato, { descricao, bairros }]) => (
        <section key={contrato} className="space-y-4">
          <header className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <FileText size={18} />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Contrato
              </div>
              <h2 className="text-base font-bold leading-tight">
                {contrato}
                {descricao && (
                  <span className="text-muted-foreground font-normal"> · {descricao}</span>
                )}
              </h2>
            </div>
          </header>

          <div className="space-y-4">
            {Array.from(bairros.entries()).map(([bairro, lista]) => (
              <div key={bairro} className="rounded-2xl border bg-card overflow-hidden shadow-sm">
                <div className="px-4 py-2.5 bg-muted/40 border-b flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <MapPin size={14} className="text-primary" />
                    <span className="capitalize">{bairro}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {lista.length} {lista.length === 1 ? "rua" : "ruas"}
                  </span>
                </div>
                <ul className="divide-y">
                  {lista.map((r) => (
                    <li key={r.id}>
                      <Link
                        to="/painel/vistorias/$ruaId"
                        params={{ ruaId: r.id }}
                        className="group flex items-center gap-3 px-4 py-3.5 hover:bg-accent/60 transition"
                      >
                        <div className="w-9 h-9 rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary flex items-center justify-center shrink-0 transition">
                          <Camera size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold capitalize truncate">{r.nome}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Toque para capturar fotos pré e pós-obra
                          </div>
                        </div>
                        <ChevronRight
                          size={18}
                          className="text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
