import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  ArrowLeft,
  Eye,
  AlertTriangle,
  CheckCircle2,
  Clock,
  AlertOctagon,
  HelpCircle,
  RefreshCw,
  X,
  Loader2,
} from "lucide-react";
import {
  listarAnalises,
  getEstatisticas,
  reprocessarFoto,
  listarEncarregadosAnalise,
  reprocessarFilaCompleta,
  processarAgora,
  getVisaoConfig,
  setVisaoModelo,
} from "@/lib/visao.functions";


export const Route = createFileRoute("/painel/visao")({
  component: VisaoPage,
});

const ETAPA_LABEL: Record<string, string> = {
  nota_servico: "Nota de Serviço",
  localizacao: "Localização",
  dds: "DDS",
  sinalizacao: "Sinalização",
  banheiro_longe: "Banheiro (longe)",
  banheiro_dentro: "Banheiro (dentro)",
  mapa_rede: "Mapa de Rede",
  escavacao_vala: "Escavando Vala",
  assentamento_tubo: "Assentamento de Tubo",
  compactacao_1a: "Compactação 1ª",
  compactacao_2a: "Compactação 2ª",
  compactacao_3a: "Compactação 3ª",
  vala_25cm_base: "Vala 25cm p/ Base",
  espalhamento_base: "Espalhamento Base",
  compactacao_base: "Compactação Base",
  construcao_pv: "Construção PV",
  acabamento_pv: "Acabamento PV",
  vala_finalizada: "Vala Finalizada",
  limpeza: "Limpeza",
  passagem_segura: "Passagem Segura",
  checklist_compactador: "Checklist Compactador",
  checklist_moto_bomba: "Checklist Motobomba",
  drenagem_boca_lobo: "Drenagem / Boca de Lobo",
  outros: "Outros",
  // legacy (análises antigas)
  vala: "Vala (antigo)",
  compactacao: "Compactação (antigo)",
  pv: "PV (antigo)",
  drenagem: "Drenagem (antigo)",
  banheiro: "Banheiro (antigo)",
  checklist: "Checklist (antigo)",
};

const CONF_META: Record<string, { label: string; cls: string; icon: any }> = {
  conforme: { label: "Conforme", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30", icon: CheckCircle2 },
  atencao: { label: "Atenção", cls: "bg-yellow-500/15 text-yellow-800 border-yellow-500/40", icon: AlertTriangle },
  nao_conforme: { label: "Não conforme", cls: "bg-orange-500/15 text-orange-700 border-orange-500/40", icon: AlertTriangle },
  critico: { label: "Crítico", cls: "bg-red-500/15 text-red-700 border-red-500/40", icon: AlertOctagon },
  inconclusivo: { label: "Inconclusivo", cls: "bg-muted text-muted-foreground border-border", icon: HelpCircle },
};

function VisaoPage() {
  const [conformidade, setConformidade] = useState<string>("todas");
  const [etapa, setEtapa] = useState<string>("todas");
  const [encarregadoId, setEncarregadoId] = useState<string>("");
  const [dias, setDias] = useState<number>(7);
  const [aberto, setAberto] = useState<any | null>(null);

  const listFn = useServerFn(listarAnalises);
  const statsFn = useServerFn(getEstatisticas);
  const encsFn = useServerFn(listarEncarregadosAnalise);
  const reprocessFn = useServerFn(reprocessarFoto);
  const reprocFilaFn = useServerFn(reprocessarFilaCompleta);
  const processarFn = useServerFn(processarAgora);
  const configFn = useServerFn(getVisaoConfig);
  const setModeloFn = useServerFn(setVisaoModelo);
  const qc = useQueryClient();
  const [drenando, setDrenando] = useState(false);
  const [quantidade, setQuantidade] = useState<number>(10);
  const drenandoRef = useRef(false);

  const modeloConfig = useQuery({
    queryKey: ["visao-modelo"],
    queryFn: () => configFn(),
  });
  const trocarModelo = useMutation({
    mutationFn: (modelo: string) => setModeloFn({ data: { modelo } }),
    onSuccess: (r: any) => {
      toast.success(`Modelo: ${r.modelo}`);
      qc.invalidateQueries({ queryKey: ["visao-modelo"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao trocar modelo."),
  });



  const stats = useQuery({
    queryKey: ["visao-stats"],
    queryFn: () => statsFn(),
    refetchInterval: 30_000,
  });

  const encs = useQuery({
    queryKey: ["visao-encs"],
    queryFn: () => encsFn(),
  });

  const lista = useQuery({
    queryKey: ["visao-lista", conformidade, etapa, encarregadoId, dias],
    queryFn: () =>
      listFn({
        data: {
          conformidade: conformidade as any,
          etapa,
          encarregadoId: encarregadoId || null,
          dias,
          limit: 60,
        },
      }),
  });

  const reproc = useMutation({
    mutationFn: (fotoId: string) => reprocessFn({ data: { fotoId } }),
    onSuccess: () => {
      toast.success("Foto enfileirada para reanálise.");
      qc.invalidateQueries({ queryKey: ["visao-stats"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const reprocFila = useMutation({
    mutationFn: () => reprocFilaFn(),
    onSuccess: (r: any) => {
      toast.success(`${r?.reenfileirados ?? 0} fotos reenfileiradas para análise.`);
      qc.invalidateQueries({ queryKey: ["visao-stats"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  // Drena `quantidade` jobs em chamadas PARALELAS (cada chamada processa 3 fotos no servidor em paralelo).
  async function drenarFila() {
    if (drenandoRef.current) return;
    drenandoRef.current = true;
    setDrenando(true);
    try {
      const alvo = Math.max(1, Math.min(200, quantidade));
      const lote = 3; // servidor processa 3 em paralelo por chamada
      const paralelas = 3; // dispara 3 chamadas simultâneas (=9 fotos por rodada)
      let processadosTotal = 0;
      let semProgresso = 0;
      while (processadosTotal < alvo && semProgresso < 2) {
        const restante = alvo - processadosTotal;
        const chamadasNestaRodada = Math.min(
          paralelas,
          Math.ceil(restante / lote),
        );
        const promises = Array.from({ length: chamadasNestaRodada }, () =>
          processarFn({
            data: {
              max: Math.min(lote, restante),
              encarregadoId: encarregadoId || null,
            },
          }).catch((e: any) => ({ processados: 0, _erro: e?.message })),
        );
        const resultados = await Promise.all(promises);
        const feitos = resultados.reduce(
          (s: number, r: any) => s + (r?.processados ?? 0),
          0,
        );
        if (!feitos) {
          semProgresso++;
        } else {
          semProgresso = 0;
          processadosTotal += feitos;
          await qc.invalidateQueries({ queryKey: ["visao-stats"] });
          await qc.invalidateQueries({ queryKey: ["visao-lista"] });
        }
      }
      toast.success(
        `Processadas ${processadosTotal} foto(s)${encarregadoId ? " do encarregado selecionado" : ""}.`,
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao processar.");
    } finally {
      drenandoRef.current = false;
      setDrenando(false);
    }
  }



  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/painel" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft size={14} /> Voltar
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Eye size={22} /> Visão IA — Análise de Fotos
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border rounded-md px-2 py-1 text-sm bg-card">
            <label className="text-xs text-muted-foreground">Modelo</label>
            <select
              value={modeloConfig.data?.modelo ?? "gpt-4o"}
              onChange={(e) => trocarModelo.mutate(e.target.value)}
              disabled={trocarModelo.isPending}
              className="bg-transparent outline-none text-sm font-medium"
              title="Modelo OpenAI usado na análise das próximas fotos"
            >
              <option value="gpt-4o">gpt-4o (qualidade)</option>
              <option value="gpt-4o-mini">gpt-4o-mini (econômico)</option>
            </select>
          </div>
          <div className="flex items-center gap-1 border rounded-md px-2 py-1 text-sm bg-card">
            <label className="text-xs text-muted-foreground">Qtd</label>
            <input
              type="number"
              min={1}
              max={200}
              value={quantidade}
              onChange={(e) => setQuantidade(Number(e.target.value) || 1)}
              className="w-16 bg-transparent outline-none text-sm"
            />
          </div>
          <button
            onClick={drenarFila}
            disabled={drenando}
            className="inline-flex items-center gap-1.5 border rounded-md px-3 py-1.5 text-sm bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            title={
              encarregadoId
                ? "Processa apenas o encarregado selecionado no filtro"
                : "Processa fotos de todos os encarregados"
            }
          >
            {drenando ? <Loader2 className="animate-spin" size={14} /> : <Eye size={14} />}
            {drenando
              ? "Processando..."
              : `Processar ${quantidade}${encarregadoId ? " (encarregado)" : ""}`}
          </button>
          <button
            onClick={() => {
              if (confirm("Reprocessar TODA a fila pendente + erros com o prompt novo?")) {
                reprocFila.mutate();
              }
            }}
            disabled={reprocFila.isPending}
            className="inline-flex items-center gap-1.5 border rounded-md px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
          >
            {reprocFila.isPending ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
            Reprocessar fila
          </button>
        </div>


      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Analisadas 24h" value={stats.data?.hoje ?? "—"} />
        <KpiCard
          label="% Conformes"
          value={stats.data ? `${stats.data.percentual_conforme}%` : "—"}
          tone={
            stats.data && stats.data.percentual_conforme >= 80
              ? "good"
              : stats.data && stats.data.percentual_conforme >= 60
                ? "warn"
                : "bad"
          }
        />
        <KpiCard
          label="Críticos 24h"
          value={stats.data?.criticos_24h ?? "—"}
          tone={stats.data && stats.data.criticos_24h > 0 ? "bad" : "good"}
        />
        <KpiCard label="Fila pendente" value={stats.data?.fila_pendente ?? "—"} />
        <KpiCard
          label="Falharam"
          value={stats.data?.fila_erro ?? "—"}
          tone={stats.data && stats.data.fila_erro > 0 ? "warn" : undefined}
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-end p-3 rounded-lg border bg-card">
        <Filtro label="Conformidade">
          <select
            value={conformidade}
            onChange={(e) => setConformidade(e.target.value)}
            className="border rounded-md px-2 py-1.5 text-sm bg-background"
          >
            <option value="todas">Todas</option>
            <option value="critico">🔴 Crítico</option>
            <option value="nao_conforme">🟠 Não conforme</option>
            <option value="atencao">🟡 Atenção</option>
            <option value="conforme">🟢 Conforme</option>
            <option value="inconclusivo">⚪ Inconclusivo</option>
          </select>
        </Filtro>
        <Filtro label="Etapa">
          <select
            value={etapa}
            onChange={(e) => setEtapa(e.target.value)}
            className="border rounded-md px-2 py-1.5 text-sm bg-background"
          >
            <option value="todas">Todas</option>
            {Object.entries(ETAPA_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Filtro>
        <Filtro label="Encarregado">
          <select
            value={encarregadoId}
            onChange={(e) => setEncarregadoId(e.target.value)}
            className="border rounded-md px-2 py-1.5 text-sm bg-background min-w-48"
          >
            <option value="">Todos</option>
            {(encs.data?.encarregados ?? []).map((e: any) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </Filtro>
        <Filtro label="Período">
          <select
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
            className="border rounded-md px-2 py-1.5 text-sm bg-background"
          >
            <option value={1}>1 dia</option>
            <option value={3}>3 dias</option>
            <option value={7}>7 dias</option>
            <option value={30}>30 dias</option>
            <option value={90}>90 dias</option>
          </select>
        </Filtro>
        <button
          onClick={() => lista.refetch()}
          className="ml-auto inline-flex items-center gap-1.5 border rounded-md px-3 py-1.5 text-sm hover:bg-accent"
        >
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {/* Grade */}
      {lista.isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="animate-spin mr-2" /> Carregando análises...
        </div>
      ) : (lista.data?.items ?? []).length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-lg">
          Nenhuma análise encontrada com esses filtros.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {(lista.data?.items ?? []).map((it: any) => (
            <CardAnalise key={it.id} item={it} onOpen={() => setAberto(it)} />
          ))}
        </div>
      )}

      {aberto && (
        <Modal
          item={aberto}
          onClose={() => setAberto(null)}
          onReanalisar={(id) => reproc.mutate(id)}
          reprocessing={reproc.isPending}
        />
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: any;
  tone?: "good" | "warn" | "bad";
}) {
  const tones = {
    good: "border-emerald-500/40 bg-emerald-500/5",
    warn: "border-yellow-500/40 bg-yellow-500/5",
    bad: "border-red-500/40 bg-red-500/5",
  } as const;
  return (
    <div className={`rounded-lg border p-3 ${tone ? tones[tone] : "bg-card"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function Filtro({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function CardAnalise({ item, onOpen }: { item: any; onOpen: () => void }) {
  const conf = CONF_META[item.conformidade_geral] ?? CONF_META.inconclusivo;
  const Icon = conf.icon;
  const enc = item.foto?.encarregados?.nome ?? item.foto?.remetente_nome ?? "—";
  const data = item.foto?.data_envio
    ? new Date(item.foto.data_envio).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "";
  return (
    <button
      onClick={onOpen}
      className="text-left rounded-lg border bg-card overflow-hidden hover:shadow-md transition group"
    >
      <div className="relative aspect-video bg-muted">
        {item.signed_url ? (
          <img
            src={item.signed_url}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-[1.02] transition"
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-muted-foreground text-xs">
            sem preview
          </div>
        )}
        <div className={`absolute top-2 left-2 inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md border ${conf.cls}`}>
          <Icon size={12} /> {conf.label}
        </div>
        <div className="absolute top-2 right-2 text-[10px] font-medium px-2 py-1 rounded-md bg-black/60 text-white">
          {ETAPA_LABEL[item.etapa] ?? item.etapa}
        </div>
      </div>
      <div className="p-3 space-y-1.5">
        <div className="text-sm font-semibold line-clamp-2">{item.resumo || "(sem resumo)"}</div>
        <div className="text-xs text-muted-foreground flex items-center justify-between">
          <span className="truncate">{enc}</span>
          <span className="shrink-0 ml-2 inline-flex items-center gap-1">
            <Clock size={10} /> {data}
          </span>
        </div>
        {item.problemas?.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {item.problemas.slice(0, 3).map((p: any, i: number) => (
              <span
                key={i}
                className="text-[10px] px-1.5 py-0.5 rounded bg-muted border"
                title={p.descricao}
              >
                {p.categoria} · {p.criticidade}
              </span>
            ))}
            {item.problemas.length > 3 && (
              <span className="text-[10px] text-muted-foreground">
                +{item.problemas.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

function Modal({
  item,
  onClose,
  onReanalisar,
  reprocessing,
}: {
  item: any;
  onClose: () => void;
  onReanalisar: (fotoId: string) => void;
  reprocessing: boolean;
}) {
  const conf = CONF_META[item.conformidade_geral] ?? CONF_META.inconclusivo;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-xl max-w-5xl w-full max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-background border-b p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1 text-sm font-bold px-2 py-1 rounded-md border ${conf.cls}`}>
              {conf.label}
            </span>
            <span className="text-sm text-muted-foreground">
              {ETAPA_LABEL[item.etapa] ?? item.etapa} · confiança {Math.round((item.etapa_confianca ?? 0) * 100)}%
            </span>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent">
            <X size={18} />
          </button>
        </div>
        <div className="grid md:grid-cols-2 gap-4 p-4">
          <div className="bg-black rounded-lg overflow-hidden">
            {item.signed_url ? (
              <img src={item.signed_url} alt="" className="w-full h-auto" />
            ) : (
              <div className="aspect-square flex items-center justify-center text-muted-foreground">
                sem preview
              </div>
            )}
          </div>
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold mb-1">Resumo</h3>
              <p className="text-sm">{item.resumo || "(sem resumo)"}</p>
            </div>
            <div>
              <h3 className="text-sm font-bold mb-1">Encarregado</h3>
              <p className="text-sm">
                {item.foto?.encarregados?.nome ?? item.foto?.remetente_nome ?? "—"}
                {item.foto?.data_envio && (
                  <span className="text-muted-foreground ml-2">
                    · {new Date(item.foto.data_envio).toLocaleString("pt-BR")}
                  </span>
                )}
              </p>
            </div>

            <Bloco titulo="EPI">
              {item.epi_detectado?.pessoas?.length > 0 ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th>#</th>
                      <th>Capacete</th>
                      <th>Colete</th>
                      <th>Luva</th>
                      <th>Bota</th>
                      <th>Óculos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.epi_detectado.pessoas.map((p: any, i: number) => (
                      <tr key={i} className="border-t">
                        <td>{p.indice ?? i + 1}</td>
                        <td>{epi(p.capacete)}</td>
                        <td>{epi(p.colete)}</td>
                        <td>{epi(p.luva)}</td>
                        <td>{epi(p.bota)}</td>
                        <td>{epi(p.oculos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhuma pessoa visível.</p>
              )}
            </Bloco>

            <Bloco titulo="Sinalização">
              {item.sinalizacao?.aplicavel ? (
                <ul className="text-xs space-y-0.5">
                  <li>Presente: {item.sinalizacao.presente ? "Sim" : "Não"}</li>
                  <li>Adequada: {item.sinalizacao.adequada ? "Sim" : "Não"}</li>
                  {item.sinalizacao.itens?.length > 0 && (
                    <li>Itens: {item.sinalizacao.itens.join(", ")}</li>
                  )}
                  {item.sinalizacao.observacoes && <li>Obs: {item.sinalizacao.observacoes}</li>}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">Não aplicável.</p>
              )}
            </Bloco>

            <Bloco titulo="Poço de Visita">
              {item.pv_qualidade?.aplicavel ? (
                <ul className="text-xs space-y-0.5">
                  <li>Tampa OK: {fmtBool(item.pv_qualidade.tampa_ok)}</li>
                  <li>Nivelamento OK: {fmtBool(item.pv_qualidade.nivelamento_ok)}</li>
                  <li>Acabamento OK: {fmtBool(item.pv_qualidade.acabamento_ok)}</li>
                  {item.pv_qualidade.observacoes && (
                    <li>Obs: {item.pv_qualidade.observacoes}</li>
                  )}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">Não aplicável.</p>
              )}
            </Bloco>

            {item.problemas?.length > 0 && (
              <Bloco titulo="Problemas detectados">
                <ul className="space-y-1.5">
                  {item.problemas.map((p: any, i: number) => (
                    <li key={i} className="text-xs border-l-2 pl-2 border-orange-500/60">
                      <strong className="uppercase">{p.criticidade}</strong> · {p.categoria}
                      <div>{p.descricao}</div>
                    </li>
                  ))}
                </ul>
              </Bloco>
            )}

            <div className="pt-2">
              <button
                onClick={() => onReanalisar(item.foto?.id)}
                disabled={reprocessing || !item.foto?.id}
                className="inline-flex items-center gap-1.5 border rounded-md px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
              >
                {reprocessing ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                Reanalisar
              </button>
              <span className="text-xs text-muted-foreground ml-3">
                Modelo: {item.modelo ?? "—"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border p-3 bg-card/50">
      <h3 className="text-sm font-bold mb-2">{titulo}</h3>
      {children}
    </div>
  );
}

function epi(v: string) {
  if (v === "presente") return <span className="text-emerald-600">✓</span>;
  if (v === "ausente") return <span className="text-red-600 font-bold">✗</span>;
  return <span className="text-muted-foreground">—</span>;
}

function fmtBool(v: boolean | null) {
  if (v === true) return <span className="text-emerald-600">Sim</span>;
  if (v === false) return <span className="text-red-600">Não</span>;
  return <span className="text-muted-foreground">—</span>;
}
