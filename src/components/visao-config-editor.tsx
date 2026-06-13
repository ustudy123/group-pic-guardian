import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Sparkles,
  X,
  Brain,
  BookOpen,
  Plus,
  Trash2,
  RotateCcw,
  Save,
  Loader2,
  Search,
  ChevronRight,
} from "lucide-react";

import { getVisaoConfig, setVisaoTextos } from "@/lib/visao.functions";
import {
  APRENDIZADO_BASE,
  MANUAL_BASE,
  parseAprendizado,
  parseManual,
  serializar,
  type AprendizadoRow,
  type ManualRow,
} from "@/lib/visao-config-base";

const GRUPOS = ["Checklist", "Ligação", "Geral"];

// Cores de identidade por aba (sutis — usadas só em acentos)
const COR = { apr: "#7c3aed", man: "#0d9488" };
const GRAD = {
  apr: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
  man: "linear-gradient(135deg, #0ea5e9 0%, #14b8a6 100%)",
};

export function VisaoConfigEditor() {
  const qc = useQueryClient();
  const configFn = useServerFn(getVisaoConfig);
  const salvarFn = useServerFn(setVisaoTextos);
  const cfg = useQuery({ queryKey: ["visao-config-textos"], queryFn: () => configFn() });

  const [open, setOpen] = useState(false);
  const [aba, setAba] = useState<"apr" | "man">("apr");
  const [apr, setApr] = useState<AprendizadoRow[]>([]);
  const [man, setMan] = useState<ManualRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busca, setBusca] = useState("");
  const [abertoApr, setAbertoApr] = useState<number | null>(null);
  const [abertoMan, setAbertoMan] = useState<number | null>(null);

  useEffect(() => {
    if (cfg.data && !dirty) {
      setApr(parseAprendizado(cfg.data.aprendizado));
      setMan(parseManual(cfg.data.manual_fotos));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.data]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const salvar = useMutation({
    mutationFn: () =>
      salvarFn({ data: { aprendizado: serializar(apr), manual_fotos: serializar(man) } }),
    onSuccess: () => {
      toast.success("Configuração da IA salva. As próximas análises já usam.");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["visao-config-textos"] });
      qc.invalidateQueries({ queryKey: ["visao-modelo"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar."),
  });

  const touch = () => setDirty(true);
  const aprSet = (i: number, patch: Partial<AprendizadoRow>) => {
    setApr((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    touch();
  };
  const manSet = (i: number, patch: Partial<ManualRow>) => {
    setMan((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    touch();
  };

  const q = busca.trim().toLowerCase();
  const aprFiltrado = useMemo(
    () => apr.map((r, i) => ({ r, i })).filter(({ r }) => !q || r.acao.toLowerCase().includes(q)),
    [apr, q],
  );
  // Manual agrupado por seção, preservando o índice original
  const manGrupos = useMemo(() => {
    const items = man.map((r, i) => ({ r, i })).filter(({ r }) => !q || r.etapa.toLowerCase().includes(q));
    const ordem = [...GRUPOS, ...new Set(items.map((x) => x.r.grupo))];
    const vistos = new Set<string>();
    const grupos: { nome: string; itens: { r: ManualRow; i: number }[] }[] = [];
    for (const g of ordem) {
      if (vistos.has(g)) continue;
      vistos.add(g);
      const itens = items.filter((x) => (GRUPOS.includes(x.r.grupo) ? x.r.grupo : "Geral") === g);
      if (itens.length) grupos.push({ nome: g, itens });
    }
    return grupos;
  }, [man, q]);

  const corAba = COR[aba];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ backgroundImage: GRAD.apr, boxShadow: "0 8px 20px -8px rgba(124,58,237,0.55)" }}
        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0"
      >
        <Sparkles size={15} />
        Configuração da IA
        {dirty && (
          <span className="ml-1 rounded bg-white/25 px-1.5 py-0.5 text-[10px] font-bold uppercase">
            não salvo
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative flex w-full max-w-2xl max-h-[88vh] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
            {/* Header */}
            <div style={{ backgroundImage: GRAD[aba] }} className="flex items-center justify-between px-5 py-4 text-white">
              <div className="flex items-center gap-2">
                <Sparkles size={18} />
                <h2 className="text-base font-bold">Configuração da IA</h2>
                {dirty && (
                  <span className="rounded bg-white/25 px-1.5 py-0.5 text-[10px] font-bold uppercase">não salvo</span>
                )}
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-white/20" aria-label="Fechar">
                <X size={18} />
              </button>
            </div>

            {/* Abas */}
            <div className="flex border-b">
              <Aba ativa={aba === "apr"} cor={COR.apr} onClick={() => setAba("apr")} icone={<Brain size={15} />} titulo="Aprendizado" n={apr.length} />
              <Aba ativa={aba === "man"} cor={COR.man} onClick={() => setAba("man")} icone={<BookOpen size={15} />} titulo="Manual de Fotos" n={man.length} />
            </div>

            {/* Busca */}
            <div className="border-b px-4 py-2.5">
              <div className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5">
                <Search size={14} className="text-muted-foreground" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder={aba === "apr" ? "Buscar etapa…" : "Buscar etapa do manual…"}
                  className="w-full bg-transparent text-sm outline-none"
                />
                {busca && (
                  <button onClick={() => setBusca("")} className="text-muted-foreground hover:text-foreground">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Corpo */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {aba === "apr" ? (
                <div className="space-y-1.5">
                  {aprFiltrado.length === 0 && <Vazio q={q} acao="Carregar base" />}
                  {aprFiltrado.map(({ r, i }) => {
                    const aberto = abertoApr === i;
                    return (
                      <Linha
                        key={i}
                        cor={COR.apr}
                        aberto={aberto}
                        onToggle={() => setAbertoApr(aberto ? null : i)}
                        titulo={r.acao || "Nova etapa"}
                        previa={r.descricao}
                        chip={
                          <span
                            style={r.rfo ? { background: COR.apr, color: "#fff" } : undefined}
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.rfo ? "" : "bg-muted text-muted-foreground"}`}
                          >
                            RFO {r.rfo ? "sim" : "não"}
                          </span>
                        }
                      >
                        <Campo label="Nome da etapa">
                          <input value={r.acao} onChange={(e) => aprSet(i, { acao: e.target.value })} className={inputCls} placeholder="Ex.: Sinalização" />
                        </Campo>
                        <Campo label="Descrição">
                          <textarea value={r.descricao} onChange={(e) => aprSet(i, { descricao: e.target.value })} rows={2} className={inputCls} placeholder="O que a foto mostra" />
                        </Campo>
                        <Campo label="Requisitos">
                          <textarea value={r.requisitos} onChange={(e) => aprSet(i, { requisitos: e.target.value })} rows={2} className={inputCls} placeholder="O que aprovar / reprovar" />
                        </Campo>
                        <div className="flex items-center justify-between pt-1">
                          <label className="flex cursor-pointer items-center gap-2 text-sm">
                            <input type="checkbox" checked={r.rfo} onChange={(e) => aprSet(i, { rfo: e.target.checked })} className="h-4 w-4" style={{ accentColor: COR.apr }} />
                            Entra no Relatório Fotográfico (RFO)
                          </label>
                          <Remover onClick={() => { setApr((x) => x.filter((_, k) => k !== i)); setAbertoApr(null); touch(); }} />
                        </div>
                      </Linha>
                    );
                  })}
                  <BtnAdd cor={COR.apr} texto="Adicionar etapa" onClick={() => { setApr((x) => [...x, { acao: "", descricao: "", requisitos: "", rfo: false }]); setAbertoApr(apr.length); setBusca(""); touch(); }} />
                </div>
              ) : (
                <div className="space-y-3">
                  {manGrupos.length === 0 && <Vazio q={q} acao="Carregar base" />}
                  {manGrupos.map((g) => (
                    <div key={g.nome}>
                      <div className="mb-1.5 flex items-center gap-2 px-1">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{g.nome}</span>
                        <span className="h-px flex-1 bg-border" />
                        <span className="text-[11px] text-muted-foreground">{g.itens.length}</span>
                      </div>
                      <div className="space-y-1.5">
                        {g.itens.map(({ r, i }) => {
                          const aberto = abertoMan === i;
                          return (
                            <Linha
                              key={i}
                              cor={COR.man}
                              aberto={aberto}
                              onToggle={() => setAbertoMan(aberto ? null : i)}
                              titulo={r.etapa || "Nova orientação"}
                              previa={r.orientacao}
                            >
                              <Campo label="Etapa">
                                <input value={r.etapa} onChange={(e) => manSet(i, { etapa: e.target.value })} className={inputCls} placeholder="Ex.: Teste de Corante" />
                              </Campo>
                              <Campo label="Orientação">
                                <textarea value={r.orientacao} onChange={(e) => manSet(i, { orientacao: e.target.value })} rows={3} className={inputCls} placeholder="Como a foto deve ser tirada" />
                              </Campo>
                              <div className="flex items-center justify-between pt-1">
                                <label className="flex items-center gap-2 text-sm">
                                  Grupo
                                  <select value={GRUPOS.includes(r.grupo) ? r.grupo : "Geral"} onChange={(e) => manSet(i, { grupo: e.target.value })} className="rounded-md border bg-card px-2 py-1 text-sm">
                                    {GRUPOS.map((gg) => <option key={gg} value={gg}>{gg}</option>)}
                                  </select>
                                </label>
                                <Remover onClick={() => { setMan((x) => x.filter((_, k) => k !== i)); setAbertoMan(null); touch(); }} />
                              </div>
                            </Linha>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <BtnAdd cor={COR.man} texto="Adicionar orientação" onClick={() => { setMan((x) => [...x, { grupo: "Checklist", etapa: "", orientacao: "" }]); setAbertoMan(man.length); setBusca(""); touch(); }} />
                </div>
              )}
            </div>

            {/* Rodapé */}
            <div className="flex items-center justify-between gap-2 border-t bg-card px-4 py-3">
              <button
                type="button"
                onClick={() => { if (aba === "apr") setApr(APRENDIZADO_BASE.map((r) => ({ ...r }))); else setMan(MANUAL_BASE.map((r) => ({ ...r }))); touch(); }}
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
                title="Preenche esta aba com o conteúdo oficial dos arquivos-base"
              >
                <RotateCcw size={14} /> Carregar base
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setApr(parseAprendizado(cfg.data?.aprendizado)); setMan(parseManual(cfg.data?.manual_fotos)); setDirty(false); }}
                  disabled={!dirty || salvar.isPending}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
                >
                  Descartar
                </button>
                <button
                  type="button"
                  onClick={() => salvar.mutate()}
                  disabled={!dirty || salvar.isPending}
                  style={{ backgroundImage: GRAD[aba], boxShadow: `0 8px 20px -8px ${corAba}` }}
                  className="inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  {salvar.isPending ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const inputCls = "w-full rounded-md border bg-card px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-offset-0";

function Aba({ ativa, cor, onClick, icone, titulo, n }: { ativa: boolean; cor: string; onClick: () => void; icone: ReactNode; titulo: string; n: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={ativa ? { color: cor, borderColor: cor } : undefined}
      className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold ${ativa ? "" : "border-transparent text-muted-foreground hover:text-foreground"}`}
    >
      {icone}
      {titulo}
      <span style={ativa ? { background: cor, color: "#fff" } : undefined} className={`rounded-full px-1.5 text-[11px] font-bold ${ativa ? "" : "bg-muted text-muted-foreground"}`}>{n}</span>
    </button>
  );
}

function Linha({ cor, aberto, onToggle, titulo, previa, chip, children }: { cor: string; aberto: boolean; onToggle: () => void; titulo: string; previa?: string; chip?: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border" style={aberto ? { borderColor: cor } : undefined}>
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center gap-2 px-3 py-2.5 text-left ${aberto ? "" : "hover:bg-accent/50"}`}
      >
        <ChevronRight size={15} className="shrink-0 text-muted-foreground transition-transform" style={{ transform: aberto ? "rotate(90deg)" : "none", color: aberto ? cor : undefined }} />
        <span className="shrink-0 text-sm font-medium">{titulo}</span>
        {previa && !aberto && <span className="truncate text-xs text-muted-foreground">— {previa}</span>}
        <span className="ml-auto">{chip}</span>
      </button>
      {aberto && <div className="space-y-2.5 border-t bg-background px-3 py-3">{children}</div>}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Remover({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
      <Trash2 size={14} /> Remover
    </button>
  );
}

function BtnAdd({ cor, texto, onClick }: { cor: string; texto: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ color: cor, borderColor: cor }} className="mt-1 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed py-2 text-sm font-medium hover:bg-accent">
      <Plus size={14} /> {texto}
    </button>
  );
}

function Vazio({ q, acao }: { q: string; acao: string }) {
  return (
    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      {q ? "Nenhum resultado para a busca." : `Vazio. Use “${acao}” para começar com o conteúdo oficial.`}
    </p>
  );
}
