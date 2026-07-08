import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/lib/use-roles";
import { avisarPushReprovacao } from "@/lib/push.functions";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  Loader2,
  Settings2,
  Plus,
  X,
  ImageOff,
} from "lucide-react";

export const Route = createFileRoute("/painel/qualidade")({
  component: PainelQualidade,
});

type Avaliacao = {
  id: string;
  foto_id: string;
  status: string;
  motivo_id: string | null;
  observacao: string | null;
  avaliado_em: string;
  correcao_foto_id?: string | null;
};

type Motivo = { id: string; nome: string; ativo: boolean; ordem: number };

const PAGE = 90;

function dataRefDias(dias: number): string {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
  return fmt.format(new Date(Date.now() - (dias - 1) * 86_400_000));
}

function horaBRT(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function PainelQualidade() {
  const qc = useQueryClient();
  const [dias, setDias] = useState(1);
  const [encarregadoId, setEncarregadoId] = useState<string>("");
  const [statusFiltro, setStatusFiltro] = useState<"pendentes" | "aprovadas" | "reprovadas" | "todas">(
    "pendentes",
  );
  const [limite, setLimite] = useState(PAGE);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [reprovando, setReprovando] = useState<string[] | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [gerindoMotivos, setGerindoMotivos] = useState(false);

  const d0 = dataRefDias(dias);

  // Papel Qualidade (= analista) e admin podem avaliar; o gate real é a RLS.
  const { podeGerenciarFormularios: podeAvaliar } = useRoles();

  const { data: encarregados = [] } = useQuery({
    queryKey: ["qualidade-encarregados"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("encarregados")
        .select("id, nome, ativo")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
  const nomeEncarregado = useMemo(
    () => new Map(encarregados.map((e) => [e.id, e.nome])),
    [encarregados],
  );

  const { data: motivos = [] } = useQuery({
    queryKey: ["motivos-reprovacao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("motivos_reprovacao")
        .select("*")
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as Motivo[];
    },
  });
  const nomeMotivo = useMemo(() => new Map(motivos.map((m) => [m.id, m.nome])), [motivos]);

  const { data: fotos = [], isLoading } = useQuery({
    queryKey: ["qualidade-fotos", d0, encarregadoId, limite],
    refetchInterval: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("fotos")
        .select("id, encarregado_id, data_envio, data_pasta, remetente_nome, caption, storage_url")
        .gte("data_pasta", d0)
        .order("data_envio", { ascending: false })
        .limit(limite);
      if (encarregadoId) q = q.eq("encarregado_id", encarregadoId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const fotoIds = useMemo(() => fotos.map((f) => f.id), [fotos]);

  const { data: avaliacoes = [] } = useQuery({
    queryKey: ["qualidade-avaliacoes", fotoIds],
    enabled: fotoIds.length > 0,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase.from("foto_avaliacoes") as any)
        .select("id, foto_id, status, motivo_id, observacao, avaliado_em, correcao_foto_id")
        .in("foto_id", fotoIds);
      if (error) throw error;
      return (data ?? []) as Avaliacao[];
    },
  });
  const avaliacaoPorFoto = useMemo(
    () => new Map(avaliacoes.map((a) => [a.foto_id, a])),
    [avaliacoes],
  );

  const { data: etapas = new Map<string, string>() } = useQuery({
    queryKey: ["qualidade-etapas", fotoIds],
    enabled: fotoIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("foto_analises")
        .select("foto_id, etapa")
        .in("foto_id", fotoIds);
      return new Map((data ?? []).map((a) => [a.foto_id, a.etapa]));
    },
  });

  // KPIs do período/filtro (contagens no servidor)
  const { data: kpis } = useQuery({
    queryKey: ["qualidade-kpis", d0, encarregadoId],
    refetchInterval: 30_000,
    queryFn: async () => {
      let total = supabase.from("fotos").select("id", { count: "exact", head: true }).gte("data_pasta", d0);
      if (encarregadoId) total = total.eq("encarregado_id", encarregadoId);
      const contaAval = (status: string) => {
        let q = supabase
          .from("foto_avaliacoes")
          .select("id, fotos!inner(data_pasta, encarregado_id)", { count: "exact", head: true })
          .eq("status", status)
          .gte("fotos.data_pasta", d0);
        if (encarregadoId) q = q.eq("fotos.encarregado_id", encarregadoId);
        return q;
      };
      const [rTotal, rAprov, rReprov] = await Promise.all([total, contaAval("aprovada"), contaAval("reprovada")]);
      const t = rTotal.count ?? 0;
      const a = rAprov.count ?? 0;
      const r = rReprov.count ?? 0;
      return { total: t, aprovadas: a, reprovadas: r, pendentes: Math.max(0, t - a - r) };
    },
  });

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["qualidade-avaliacoes"] });
    qc.invalidateQueries({ queryKey: ["qualidade-kpis"] });
  };

  const avaliar = useMutation({
    mutationFn: async ({
      ids,
      status,
      motivoId,
      observacao,
    }: {
      ids: string[];
      status: "aprovada" | "reprovada";
      motivoId?: string;
      observacao?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const rows = ids.map((foto_id) => ({
        foto_id,
        status,
        motivo_id: status === "reprovada" ? motivoId : null,
        observacao: status === "reprovada" ? observacao || null : null,
        avaliado_por: user?.id ?? null,
        avaliado_em: new Date().toISOString(),
        notificado: false,
      }));
      const { error } = await supabase.from("foto_avaliacoes").upsert(rows, { onConflict: "foto_id" });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(
        vars.status === "aprovada"
          ? `${vars.ids.length} foto(s) aprovada(s)`
          : `${vars.ids.length} foto(s) reprovada(s)`,
      );
      if (vars.status === "reprovada") {
        // Push imediato no app do encarregado (fire-and-forget;
        // o resumo por WhatsApp continua saindo pelo cron)
        avisarPushReprovacao({ data: { fotoIds: vars.ids } }).catch(() => {});
      }
      setSelecionadas(new Set());
      setReprovando(null);
      invalidar();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const desfazer = useMutation({
    mutationFn: async (fotoId: string) => {
      const { error } = await supabase.from("foto_avaliacoes").delete().eq("foto_id", fotoId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Avaliação removida");
      invalidar();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const visiveis = useMemo(() => {
    if (statusFiltro === "todas") return fotos;
    return fotos.filter((f) => {
      const av = avaliacaoPorFoto.get(f.id);
      if (statusFiltro === "pendentes") return !av;
      return av?.status === (statusFiltro === "aprovadas" ? "aprovada" : "reprovada");
    });
  }, [fotos, avaliacaoPorFoto, statusFiltro]);

  const toggleSel = (id: string) => {
    setSelecionadas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const detalhe = detalheId ? fotos.find((f) => f.id === detalheId) : null;
  const motivosAtivos = motivos.filter((m) => m.ativo);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Visão Qualidade</h1>
          <p className="text-sm text-muted-foreground">
            Fotos chegam aqui em tempo real. Aprove ou reprove (com motivo) — individual ou em lote.
          </p>
        </div>
        {podeAvaliar && (
          <button
            onClick={() => setGerindoMotivos(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-accent"
          >
            <Settings2 size={14} /> Motivos de reprovação
          </button>
        )}
      </div>

      {!podeAvaliar && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Modo somente leitura — para aprovar/reprovar, seu usuário precisa do papel <b>admin</b> ou{" "}
          <b>analista</b>.
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { l: "Fotos no período", v: kpis?.total ?? "…", cls: "" },
          { l: "Pendentes", v: kpis?.pendentes ?? "…", cls: "text-amber-600" },
          { l: "Aprovadas", v: kpis?.aprovadas ?? "…", cls: "text-emerald-600" },
          { l: "Reprovadas", v: kpis?.reprovadas ?? "…", cls: "text-red-600" },
        ].map((k) => (
          <div key={k.l} className="rounded-xl border bg-card px-3 py-2.5 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.l}</div>
            <div className={`text-xl font-bold ${k.cls}`}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select
          value={dias}
          onChange={(e) => {
            setDias(Number(e.target.value));
            setLimite(PAGE);
          }}
          className="rounded-md border bg-background px-2 py-1.5"
        >
          <option value={1}>Hoje</option>
          <option value={3}>Últimos 3 dias</option>
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
        </select>
        <select
          value={encarregadoId}
          onChange={(e) => {
            setEncarregadoId(e.target.value);
            setLimite(PAGE);
          }}
          className="rounded-md border bg-background px-2 py-1.5 max-w-52"
        >
          <option value="">Todos os encarregados</option>
          {encarregados
            .filter((e) => e.ativo)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
        </select>
        <div className="inline-flex rounded-md border overflow-hidden">
          {(
            [
              ["pendentes", "Pendentes"],
              ["aprovadas", "Aprovadas"],
              ["reprovadas", "Reprovadas"],
              ["todas", "Todas"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setStatusFiltro(v)}
              className={`px-3 py-1.5 text-xs font-medium ${
                statusFiltro === v ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Barra de ações em lote */}
      {podeAvaliar && selecionadas.size > 0 && (
        <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-lg">
          <span className="text-sm font-semibold">{selecionadas.size} selecionada(s)</span>
          <button
            onClick={() => avaliar.mutate({ ids: [...selecionadas], status: "aprovada" })}
            disabled={avaliar.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {avaliar.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Aprovar
          </button>
          <button
            onClick={() => setReprovando([...selecionadas])}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
          >
            <XCircle size={14} /> Reprovar
          </button>
          <button
            onClick={() => setSelecionadas(new Set())}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          >
            Limpar seleção
          </button>
        </div>
      )}

      {/* Grade */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground py-10 text-center">Carregando fotos...</div>
      ) : visiveis.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
          <ImageOff className="mx-auto mb-2 opacity-50" />
          Nenhuma foto {statusFiltro !== "todas" ? `(${statusFiltro})` : ""} no período selecionado.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {visiveis.map((f) => {
            const av = avaliacaoPorFoto.get(f.id);
            const sel = selecionadas.has(f.id);
            const etapa = etapas.get(f.id);
            return (
              <div
                key={f.id}
                className={`group relative rounded-xl border bg-card overflow-hidden shadow-sm transition ${
                  sel ? "ring-2 ring-primary" : ""
                }`}
              >
                <button
                  onClick={() => setDetalheId(f.id)}
                  className="block w-full aspect-square bg-muted"
                  title="Ver detalhe"
                >
                  {f.storage_url ? (
                    <img
                      src={f.storage_url}
                      alt={f.caption ?? "foto"}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <ImageOff size={20} />
                    </div>
                  )}
                </button>
                {podeAvaliar && (
                  <label
                    className="absolute left-1.5 top-1.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md bg-black/50"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={sel}
                      onChange={() => toggleSel(f.id)}
                      className="h-3.5 w-3.5"
                    />
                  </label>
                )}
                <div className="absolute right-1.5 top-1.5">
                  {!av ? (
                    <span className="rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold text-white">
                      Pendente
                    </span>
                  ) : av.status === "aprovada" ? (
                    <span className="rounded-full bg-emerald-600/90 px-2 py-0.5 text-[10px] font-bold text-white">
                      Aprovada
                    </span>
                  ) : av.correcao_foto_id ? (
                    <span className="rounded-full bg-sky-600/90 px-2 py-0.5 text-[10px] font-bold text-white">
                      Corrigida
                    </span>
                  ) : (
                    <span className="rounded-full bg-red-600/90 px-2 py-0.5 text-[10px] font-bold text-white">
                      Reprovada
                    </span>
                  )}
                </div>
                <div className="p-2 text-xs space-y-0.5">
                  <div className="font-semibold truncate">
                    {nomeEncarregado.get(f.encarregado_id ?? "") ?? f.remetente_nome ?? "—"}
                  </div>
                  <div className="text-muted-foreground">
                    {f.data_pasta} · {horaBRT(f.data_envio)}
                    {etapa ? ` · ${etapa.replaceAll("_", " ")}` : ""}
                  </div>
                  {av?.status === "reprovada" && (
                    <div className="text-red-600 truncate" title={nomeMotivo.get(av.motivo_id ?? "")}>
                      {nomeMotivo.get(av.motivo_id ?? "") ?? "Motivo removido"}
                    </div>
                  )}
                </div>
                {podeAvaliar && (
                  <div className="flex border-t divide-x">
                    {!av ? (
                      <>
                        <button
                          onClick={() => avaliar.mutate({ ids: [f.id], status: "aprovada" })}
                          className="flex-1 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
                        >
                          Aprovar
                        </button>
                        <button
                          onClick={() => setReprovando([f.id])}
                          className="flex-1 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                        >
                          Reprovar
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => desfazer.mutate(f.id)}
                        className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 text-[11px] text-muted-foreground hover:bg-accent"
                      >
                        <RotateCcw size={11} /> Desfazer
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {fotos.length >= limite && (
        <div className="text-center">
          <button
            onClick={() => setLimite((l) => l + PAGE)}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-accent"
          >
            Carregar mais
          </button>
        </div>
      )}

      {/* Modal de reprovação (motivo obrigatório) */}
      {reprovando && (
        <ModalReprovar
          qtd={reprovando.length}
          motivos={motivosAtivos}
          onCancel={() => setReprovando(null)}
          onConfirm={(motivoId, observacao) =>
            avaliar.mutate({ ids: reprovando, status: "reprovada", motivoId, observacao })
          }
          pending={avaliar.isPending}
        />
      )}

      {/* Modal detalhe */}
      {detalhe && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setDetalheId(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-2">
              <div className="text-sm font-semibold">
                {nomeEncarregado.get(detalhe.encarregado_id ?? "") ?? detalhe.remetente_nome ?? "Foto"}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {detalhe.data_pasta} · {horaBRT(detalhe.data_envio)}
                </span>
              </div>
              <button onClick={() => setDetalheId(null)} className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>
            {detalhe.storage_url && (
              <img src={detalhe.storage_url} alt="" className="max-h-[60vh] w-full object-contain bg-black/5" />
            )}
            <div className="space-y-2 p-4 text-sm">
              {detalhe.caption && <p className="text-muted-foreground">“{detalhe.caption}”</p>}
              {etapas.get(detalhe.id) && (
                <p className="text-xs text-muted-foreground">
                  Classificação da IA (apoio): <b>{etapas.get(detalhe.id)!.replaceAll("_", " ")}</b>
                </p>
              )}
              {(() => {
                const av = avaliacaoPorFoto.get(detalhe.id);
                if (!av)
                  return <p className="text-amber-600 text-xs font-semibold">Aguardando avaliação</p>;
                return (
                  <p className={`text-xs font-semibold ${av.status === "aprovada" ? "text-emerald-600" : "text-red-600"}`}>
                    {av.status === "aprovada" ? "Aprovada" : "Reprovada"}
                    {av.motivo_id ? ` — ${nomeMotivo.get(av.motivo_id) ?? ""}` : ""}
                    {av.observacao ? ` · ${av.observacao}` : ""}
                  </p>
                );
              })()}
              {podeAvaliar && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => {
                      avaliar.mutate({ ids: [detalhe.id], status: "aprovada" });
                      setDetalheId(null);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    <CheckCircle2 size={14} /> Aprovar
                  </button>
                  <button
                    onClick={() => {
                      setReprovando([detalhe.id]);
                      setDetalheId(null);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
                  >
                    <XCircle size={14} /> Reprovar
                  </button>
                  {avaliacaoPorFoto.get(detalhe.id) && (
                    <button
                      onClick={() => desfazer.mutate(detalhe.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-accent"
                    >
                      <RotateCcw size={14} /> Desfazer
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal gestão de motivos */}
      {gerindoMotivos && (
        <ModalMotivos motivos={motivos} onClose={() => setGerindoMotivos(false)} />
      )}
    </div>
  );
}

function ModalReprovar({
  qtd,
  motivos,
  onCancel,
  onConfirm,
  pending,
}: {
  qtd: number;
  motivos: Motivo[];
  onCancel: () => void;
  onConfirm: (motivoId: string, observacao: string) => void;
  pending: boolean;
}) {
  const [motivoId, setMotivoId] = useState(motivos[0]?.id ?? "");
  const [observacao, setObservacao] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">
          Reprovar {qtd > 1 ? `${qtd} fotos` : "foto"}
        </h2>
        <label className="block text-sm">
          <span className="text-muted-foreground">Motivo (obrigatório)</span>
          <select
            value={motivoId}
            onChange={(e) => setMotivoId(e.target.value)}
            className="mt-1 w-full rounded-md border bg-background px-2 py-2"
          >
            {motivos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Observação (opcional)</span>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 resize-none"
            placeholder="Detalhe adicional para o encarregado"
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCancel} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-accent">
            Cancelar
          </button>
          <button
            onClick={() => motivoId && onConfirm(motivoId, observacao)}
            disabled={!motivoId || pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
            Confirmar reprovação
          </button>
        </div>
        {motivos.length === 0 && (
          <p className="text-xs text-red-600">
            Nenhum motivo ativo cadastrado — cadastre em “Motivos de reprovação”.
          </p>
        )}
      </div>
    </div>
  );
}

function ModalMotivos({ motivos, onClose }: { motivos: Motivo[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [novo, setNovo] = useState("");

  const invalidar = () => qc.invalidateQueries({ queryKey: ["motivos-reprovacao"] });

  const criar = useMutation({
    mutationFn: async () => {
      const ordem = (motivos[motivos.length - 1]?.ordem ?? 0) + 1;
      const { error } = await supabase.from("motivos_reprovacao").insert({ nome: novo.trim(), ordem });
      if (error) throw error;
    },
    onSuccess: () => {
      setNovo("");
      invalidar();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const atualizar = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Motivo> }) => {
      const { error } = await supabase.from("motivos_reprovacao").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Motivos de reprovação</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          A lista alimenta o dropdown de reprovação e as estatísticas. Desative (em vez de excluir)
          para preservar o histórico.
        </p>
        <div className="space-y-1.5 max-h-72 overflow-auto">
          {motivos.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <input
                defaultValue={m.nome}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== m.nome) atualizar.mutate({ id: m.id, patch: { nome: v } });
                }}
                className={`flex-1 rounded-md border bg-background px-2 py-1.5 text-sm ${
                  m.ativo ? "" : "opacity-50 line-through"
                }`}
              />
              <button
                onClick={() => atualizar.mutate({ id: m.id, patch: { ativo: !m.ativo } })}
                className={`rounded-md border px-2 py-1.5 text-xs font-medium ${
                  m.ativo ? "text-red-600 hover:bg-red-50" : "text-emerald-600 hover:bg-emerald-50"
                }`}
              >
                {m.ativo ? "Desativar" : "Reativar"}
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 border-t pt-3">
          <input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && novo.trim() && criar.mutate()}
            placeholder="Novo motivo (ex.: Foto tremida / sem foco)"
            className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
          />
          <button
            onClick={() => novo.trim() && criar.mutate()}
            disabled={!novo.trim() || criar.isPending}
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
          >
            <Plus size={13} /> Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}
