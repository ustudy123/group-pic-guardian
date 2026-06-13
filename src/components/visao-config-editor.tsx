import { useEffect, useState, type ReactNode } from "react";
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

// Identidade visual de cada aba (cores distintas para separar Aprendizado x Manual)
const TEMA = {
  apr: {
    grad: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    cor: "#7c3aed",
    soft: "rgba(124, 58, 237, 0.06)",
    borda: "rgba(124, 58, 237, 0.30)",
    sombra: "0 10px 24px -8px rgba(124, 58, 237, 0.55)",
  },
  man: {
    grad: "linear-gradient(135deg, #0ea5e9 0%, #14b8a6 100%)",
    cor: "#0d9488",
    soft: "rgba(13, 148, 136, 0.06)",
    borda: "rgba(13, 148, 136, 0.30)",
    sombra: "0 10px 24px -8px rgba(13, 148, 136, 0.55)",
  },
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

  useEffect(() => {
    if (cfg.data && !dirty) {
      setApr(parseAprendizado(cfg.data.aprendizado));
      setMan(parseManual(cfg.data.manual_fotos));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.data]);

  // Esc fecha, e trava o scroll do fundo enquanto aberto
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

  const tema = TEMA[aba];
  const totalApr = apr.length;
  const totalMan = man.length;

  return (
    <>
      {/* ---------- Botão de acesso (vai na barra do topo) ---------- */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ backgroundImage: TEMA.apr.grad, boxShadow: TEMA.apr.sombra }}
        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0"
      >
        <Sparkles size={15} />
        Configuração da IA
        {dirty && (
          <span className="ml-1 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-white/25">
            não salvo
          </span>
        )}
      </button>

      {/* ---------- Modal ---------- */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative flex w-full max-w-3xl max-h-[88vh] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
            {/* Header com gradiente da aba ativa */}
            <div
              style={{ backgroundImage: tema.grad }}
              className="flex items-center justify-between px-5 py-4 text-white"
            >
              <div className="flex items-center gap-2">
                <Sparkles size={18} />
                <h2 className="text-lg font-bold">Configuração da IA</h2>
                {dirty && (
                  <span className="ml-1 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-white/25">
                    não salvo
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 hover:bg-white/20"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            {/* Abas (separação clara entre Aprendizado e Manual) */}
            <div className="flex gap-2 border-b bg-card px-4 pt-3">
              <TabBtn
                ativa={aba === "apr"}
                cor={TEMA.apr.cor}
                onClick={() => setAba("apr")}
                icone={<Brain size={15} />}
                titulo="Aprendizado"
                contagem={totalApr}
              />
              <TabBtn
                ativa={aba === "man"}
                cor={TEMA.man.cor}
                onClick={() => setAba("man")}
                icone={<BookOpen size={15} />}
                titulo="Manual de Fotos"
                contagem={totalMan}
              />
            </div>

            {/* Corpo rolável */}
            <div className="flex-1 overflow-y-auto p-4" style={{ background: tema.soft }}>
              {aba === "apr" ? (
                <>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Cada etapa: o que a IA reconhece, os requisitos a verificar e se entra no
                    Relatório Fotográfico (RFO).
                  </p>
                  <div className="space-y-2.5">
                    {totalApr === 0 && <Vazio texto="Nenhuma etapa. Use “Carregar base” para começar." />}
                    {apr.map((r, i) => (
                      <Card key={i} cor={TEMA.apr.cor} borda={TEMA.apr.borda}>
                        <div className="flex items-center gap-2">
                          <input
                            value={r.acao}
                            onChange={(e) => aprSet(i, { acao: e.target.value })}
                            placeholder="Nome da etapa (ex.: Sinalização)"
                            className="flex-1 rounded-md border bg-card px-2 py-1 text-sm font-semibold"
                          />
                          <button
                            type="button"
                            onClick={() => aprSet(i, { rfo: !r.rfo })}
                            style={
                              r.rfo
                                ? { backgroundImage: TEMA.apr.grad, color: "#fff", borderColor: "transparent" }
                                : undefined
                            }
                            className="whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-accent"
                            title="Define se a etapa entra no Relatório Fotográfico"
                          >
                            RFO: {r.rfo ? "sim" : "não"}
                          </button>
                          <BtnLixo onClick={() => { setApr((x) => x.filter((_, k) => k !== i)); touch(); }} />
                        </div>
                        <textarea
                          value={r.descricao}
                          onChange={(e) => aprSet(i, { descricao: e.target.value })}
                          placeholder="Descrição — o que a foto mostra"
                          rows={2}
                          className="w-full rounded-md border bg-card px-2 py-1 text-sm"
                        />
                        <textarea
                          value={r.requisitos}
                          onChange={(e) => aprSet(i, { requisitos: e.target.value })}
                          placeholder="Requisitos — o que aprovar/reprovar"
                          rows={2}
                          className="w-full rounded-md border bg-card px-2 py-1 text-sm"
                        />
                      </Card>
                    ))}
                  </div>
                  <BtnAdd
                    cor={TEMA.apr.cor}
                    onClick={() => { setApr((x) => [...x, { acao: "", descricao: "", requisitos: "", rfo: false }]); touch(); }}
                    texto="Adicionar etapa"
                  />
                </>
              ) : (
                <>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Orientação oficial de enquadramento por etapa. A IA usa para classificar e
                    validar se a foto foi tirada certo.
                  </p>
                  <div className="space-y-2.5">
                    {totalMan === 0 && <Vazio texto="Nenhuma orientação. Use “Carregar base” para começar." />}
                    {man.map((r, i) => (
                      <Card key={i} cor={TEMA.man.cor} borda={TEMA.man.borda}>
                        <div className="flex items-center gap-2">
                          <select
                            value={GRUPOS.includes(r.grupo) ? r.grupo : "Geral"}
                            onChange={(e) => manSet(i, { grupo: e.target.value })}
                            className="rounded-md border bg-card px-2 py-1 text-xs"
                            title="Grupo da etapa"
                          >
                            {GRUPOS.map((g) => (
                              <option key={g} value={g}>{g}</option>
                            ))}
                          </select>
                          <input
                            value={r.etapa}
                            onChange={(e) => manSet(i, { etapa: e.target.value })}
                            placeholder="Etapa (ex.: Teste de Corante)"
                            className="flex-1 rounded-md border bg-card px-2 py-1 text-sm font-semibold"
                          />
                          <BtnLixo onClick={() => { setMan((x) => x.filter((_, k) => k !== i)); touch(); }} />
                        </div>
                        <textarea
                          value={r.orientacao}
                          onChange={(e) => manSet(i, { orientacao: e.target.value })}
                          placeholder="Como a foto deve ser tirada"
                          rows={2}
                          className="w-full rounded-md border bg-card px-2 py-1 text-sm"
                        />
                      </Card>
                    ))}
                  </div>
                  <BtnAdd
                    cor={TEMA.man.cor}
                    onClick={() => { setMan((x) => [...x, { grupo: "Checklist", etapa: "", orientacao: "" }]); touch(); }}
                    texto="Adicionar orientação"
                  />
                </>
              )}
            </div>

            {/* Rodapé */}
            <div className="flex items-center justify-between gap-2 border-t bg-card px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  if (aba === "apr") setApr(APRENDIZADO_BASE.map((r) => ({ ...r })));
                  else setMan(MANUAL_BASE.map((r) => ({ ...r })));
                  touch();
                }}
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
                title="Preenche esta aba com o conteúdo oficial dos arquivos-base"
              >
                <RotateCcw size={14} /> Carregar base
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setApr(parseAprendizado(cfg.data?.aprendizado));
                    setMan(parseManual(cfg.data?.manual_fotos));
                    setDirty(false);
                  }}
                  disabled={!dirty || salvar.isPending}
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
                >
                  Descartar
                </button>
                <button
                  type="button"
                  onClick={() => salvar.mutate()}
                  disabled={!dirty || salvar.isPending}
                  style={{ backgroundImage: tema.grad, boxShadow: tema.sombra }}
                  className="inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  {salvar.isPending ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                  Salvar configuração
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TabBtn({
  ativa, cor, onClick, icone, titulo, contagem,
}: {
  ativa: boolean; cor: string; onClick: () => void;
  icone: ReactNode; titulo: string; contagem: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={ativa ? { color: cor, borderColor: cor } : undefined}
      className={`-mb-px flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-sm font-semibold ${
        ativa ? "" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icone}
      {titulo}
      <span
        style={ativa ? { background: cor, color: "#fff" } : undefined}
        className={`rounded-full px-1.5 text-[11px] font-bold ${ativa ? "" : "bg-muted text-muted-foreground"}`}
      >
        {contagem}
      </span>
    </button>
  );
}

function Card({ children, cor, borda }: { children: ReactNode; cor: string; borda: string }) {
  return (
    <div
      style={{ borderLeft: `3px solid ${cor}`, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
      className="space-y-2 rounded-lg border bg-background p-3 transition-shadow hover:shadow-md"
    >
      {children}
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">{texto}</p>;
}

function BtnLixo({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="p-1 text-muted-foreground hover:text-destructive" title="Remover">
      <Trash2 size={15} />
    </button>
  );
}

function BtnAdd({ cor, onClick, texto }: { cor: string; onClick: () => void; texto: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ color: cor, borderColor: cor }}
      className="mt-3 inline-flex items-center gap-1 rounded-md border border-dashed px-3 py-1.5 text-sm font-medium hover:bg-accent"
    >
      <Plus size={14} /> {texto}
    </button>
  );
}
