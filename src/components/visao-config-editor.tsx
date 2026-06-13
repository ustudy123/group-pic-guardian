import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Brain,
  BookOpen,
  Plus,
  Trash2,
  RotateCcw,
  Save,
  Loader2,
  ChevronDown,
  ChevronUp,
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

export function VisaoConfigEditor() {
  const qc = useQueryClient();
  const configFn = useServerFn(getVisaoConfig);
  const salvarFn = useServerFn(setVisaoTextos);

  const cfg = useQuery({ queryKey: ["visao-config-textos"], queryFn: () => configFn() });

  const [aberto, setAberto] = useState(false);
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

  // ---- ações Aprendizado ----
  const aprSet = (i: number, patch: Partial<AprendizadoRow>) => {
    setApr((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    touch();
  };
  const aprAdd = () => {
    setApr((r) => [...r, { acao: "", descricao: "", requisitos: "", rfo: false }]);
    touch();
  };
  const aprDel = (i: number) => {
    setApr((r) => r.filter((_, idx) => idx !== i));
    touch();
  };

  // ---- ações Manual ----
  const manSet = (i: number, patch: Partial<ManualRow>) => {
    setMan((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    touch();
  };
  const manAdd = () => {
    setMan((r) => [...r, { grupo: "Checklist", etapa: "", orientacao: "" }]);
    touch();
  };
  const manDel = (i: number) => {
    setMan((r) => r.filter((_, idx) => idx !== i));
    touch();
  };

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-primary" />
          <span className="font-semibold text-sm">Configuração da IA</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Aprendizado + Manual de Fotos usados nas próximas análises
          </span>
          {dirty && (
            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-800 border border-yellow-500/40">
              não salvo
            </span>
          )}
        </div>
        {aberto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {aberto && (
        <div className="px-4 pb-4 space-y-6 border-t pt-4">
          {/* ---------------- APRENDIZADO ---------------- */}
          <section>
            <div className="flex items-center justify-between mb-1 gap-2">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <Brain size={14} /> Aprendizado — critérios por etapa
              </label>
              <button
                type="button"
                onClick={() => {
                  setApr(APRENDIZADO_BASE.map((r) => ({ ...r })));
                  touch();
                }}
                className="inline-flex items-center gap-1 text-xs border rounded-md px-2 py-1 hover:bg-accent"
                title="Preenche com o conteúdo da planilha ANÁLISE"
              >
                <RotateCcw size={12} /> Carregar base
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Cada linha é uma etapa: o que a IA deve reconhecer, os requisitos a verificar e se
              entra no Relatório Fotográfico (RFO).
            </p>

            <div className="space-y-2">
              {apr.length === 0 && (
                <p className="text-sm text-muted-foreground border rounded-md p-3">
                  Nenhuma etapa ainda. Use “Carregar base” para começar com a planilha, ou
                  “Adicionar etapa”.
                </p>
              )}
              {apr.map((r, i) => (
                <div key={i} className="border rounded-md p-3 bg-background space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={r.acao}
                      onChange={(e) => aprSet(i, { acao: e.target.value })}
                      placeholder="Nome da etapa (ex.: Sinalização)"
                      className="flex-1 border rounded-md px-2 py-1 text-sm font-medium bg-card"
                    />
                    <button
                      type="button"
                      onClick={() => aprSet(i, { rfo: !r.rfo })}
                      className={`text-xs font-semibold rounded-md px-2 py-1 border whitespace-nowrap ${
                        r.rfo
                          ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/40"
                          : "text-muted-foreground hover:bg-accent"
                      }`}
                      title="Define se a etapa entra no Relatório Fotográfico de Obra"
                    >
                      RFO: {r.rfo ? "sim" : "não"}
                    </button>
                    <button
                      type="button"
                      onClick={() => aprDel(i)}
                      className="text-muted-foreground hover:text-destructive p-1"
                      title="Remover etapa"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <textarea
                    value={r.descricao}
                    onChange={(e) => aprSet(i, { descricao: e.target.value })}
                    placeholder="Descrição — o que a foto mostra"
                    rows={2}
                    className="w-full border rounded-md px-2 py-1 text-sm bg-card"
                  />
                  <textarea
                    value={r.requisitos}
                    onChange={(e) => aprSet(i, { requisitos: e.target.value })}
                    placeholder="Requisitos — o que a IA deve verificar para aprovar"
                    rows={2}
                    className="w-full border rounded-md px-2 py-1 text-sm bg-card"
                  />
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={aprAdd}
              className="mt-2 inline-flex items-center gap-1 text-sm border rounded-md px-3 py-1.5 hover:bg-accent"
            >
              <Plus size={14} /> Adicionar etapa
            </button>
          </section>

          {/* ---------------- MANUAL DE FOTOS ---------------- */}
          <section>
            <div className="flex items-center justify-between mb-1 gap-2">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <BookOpen size={14} /> Manual de Fotos — como tirar cada foto
              </label>
              <button
                type="button"
                onClick={() => {
                  setMan(MANUAL_BASE.map((r) => ({ ...r })));
                  touch();
                }}
                className="inline-flex items-center gap-1 text-xs border rounded-md px-2 py-1 hover:bg-accent"
                title="Preenche com o conteúdo do Manual de Fotos"
              >
                <RotateCcw size={12} /> Carregar base
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Orientação oficial de enquadramento por etapa. A IA usa para classificar a etapa e
              validar se a foto foi tirada corretamente.
            </p>

            <div className="space-y-2">
              {man.length === 0 && (
                <p className="text-sm text-muted-foreground border rounded-md p-3">
                  Nenhuma orientação ainda. Use “Carregar base” para começar com o manual.
                </p>
              )}
              {man.map((r, i) => (
                <div key={i} className="border rounded-md p-3 bg-background space-y-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={GRUPOS.includes(r.grupo) ? r.grupo : "Geral"}
                      onChange={(e) => manSet(i, { grupo: e.target.value })}
                      className="border rounded-md px-2 py-1 text-xs bg-card"
                      title="Grupo da etapa"
                    >
                      {GRUPOS.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                    <input
                      value={r.etapa}
                      onChange={(e) => manSet(i, { etapa: e.target.value })}
                      placeholder="Etapa (ex.: Teste de Corante)"
                      className="flex-1 border rounded-md px-2 py-1 text-sm font-medium bg-card"
                    />
                    <button
                      type="button"
                      onClick={() => manDel(i)}
                      className="text-muted-foreground hover:text-destructive p-1"
                      title="Remover orientação"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <textarea
                    value={r.orientacao}
                    onChange={(e) => manSet(i, { orientacao: e.target.value })}
                    placeholder="Como a foto deve ser tirada"
                    rows={2}
                    className="w-full border rounded-md px-2 py-1 text-sm bg-card"
                  />
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={manAdd}
              className="mt-2 inline-flex items-center gap-1 text-sm border rounded-md px-3 py-1.5 hover:bg-accent"
            >
              <Plus size={14} /> Adicionar orientação
            </button>
          </section>

          {/* ---------------- AÇÕES ---------------- */}
          <div className="flex items-center justify-end gap-2 border-t pt-3">
            <button
              type="button"
              onClick={() => {
                setApr(parseAprendizado(cfg.data?.aprendizado));
                setMan(parseManual(cfg.data?.manual_fotos));
                setDirty(false);
              }}
              disabled={!dirty || salvar.isPending}
              className="inline-flex items-center gap-1.5 border rounded-md px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={() => salvar.mutate()}
              disabled={!dirty || salvar.isPending}
              className="inline-flex items-center gap-1.5 border rounded-md px-3 py-1.5 text-sm bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {salvar.isPending ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
              Salvar configuração
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
