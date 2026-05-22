import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMinhasRuas } from "@/lib/vistorias.functions";
import { MapPin, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/painel/vistorias/")({
  component: MinhasVistorias,
});

function MinhasVistorias() {
  const fn = useServerFn(listMinhasRuas);
  const { data, isLoading } = useQuery({
    queryKey: ["minhas-ruas"],
    queryFn: () => fn(),
  });

  if (isLoading) return <div className="text-muted-foreground">Carregando...</div>;
  const ruas = (data?.ruas ?? []) as any[];

  if (ruas.length === 0) {
    return (
      <div className="text-center py-12 border rounded-xl bg-card space-y-2">
        <h2 className="text-lg font-semibold">Nenhuma rua atribuída</h2>
        <p className="text-sm text-muted-foreground">
          Peça ao administrador para atribuir ruas a você na aba <strong>Cadastros</strong>.
        </p>
      </div>
    );
  }

  // Agrupa por contrato → bairro
  const grupos = new Map<string, Map<string, any[]>>();
  for (const r of ruas) {
    const contrato = r.bairros?.contratos?.numero ?? "Sem contrato";
    const bairro = r.bairros?.nome ?? "Sem bairro";
    if (!grupos.has(contrato)) grupos.set(contrato, new Map());
    const sub = grupos.get(contrato)!;
    if (!sub.has(bairro)) sub.set(bairro, []);
    sub.get(bairro)!.push(r);
  }

  return (
    <div className="space-y-6">
      {Array.from(grupos.entries()).map(([contrato, bairros]) => (
        <div key={contrato} className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Contrato {contrato}
          </h2>
          {Array.from(bairros.entries()).map(([bairro, lista]) => (
            <div key={bairro} className="rounded-xl border bg-card overflow-hidden">
              <div className="px-4 py-2 bg-muted/50 font-semibold flex items-center gap-2">
                <MapPin size={14} /> {bairro}
              </div>
              <ul className="divide-y">
                {lista.map((r) => (
                  <li key={r.id}>
                    <Link
                      to="/painel/vistorias/$ruaId"
                      params={{ ruaId: r.id }}
                      className="flex items-center justify-between px-4 py-3 hover:bg-accent transition"
                    >
                      <span className="font-medium">{r.nome}</span>
                      <ChevronRight size={16} className="text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
