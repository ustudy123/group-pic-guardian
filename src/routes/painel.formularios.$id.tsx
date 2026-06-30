import { createFileRoute, Link, useNavigate, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FORM_GRAD, FORM_GRAD_BTN, FORM_SHADOW } from "@/lib/ui-form";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Type,
  AlignLeft,
  Hash,
  Calendar,
  Clock,
  CalendarClock,
  CircleDot,
  CheckSquare,
  Paperclip,
  Image as ImageIcon,
  Heading,
  Send,
  Eye,
  Pencil,
  Link as LinkIcon,
  GitBranch,
  X,
} from "lucide-react";

export const Route = createFileRoute("/painel/formularios/$id")({
  component: EditorWrapper,
});

function EditorWrapper() {
  const loc = useLocation();
  if (loc.pathname.endsWith("/respostas")) return <Outlet />;
  return <Editor />;
}

type CondicaoCampo = {
  campo_id: string;
  operador: "igual" | "diferente";
  valor: string;
};

type Campo = {
  id: string;
  formulario_id: string;
  ordem: number;
  tipo: string;
  rotulo: string;
  descricao: string | null;
  placeholder: string | null;
  obrigatorio: boolean;
  opcoes: any;
  config: any;
  condicao: CondicaoCampo | null;
};

const TIPOS = [
  { v: "secao", l: "Seção / Título", Icon: Heading },
  { v: "texto_curto", l: "Texto curto", Icon: Type },
  { v: "texto_longo", l: "Texto longo", Icon: AlignLeft },
  { v: "numero", l: "Número", Icon: Hash },
  { v: "data", l: "Data", Icon: Calendar },
  { v: "hora", l: "Hora", Icon: Clock },
  { v: "datahora", l: "Data e hora", Icon: CalendarClock },
  { v: "escolha_unica", l: "Escolha única", Icon: CircleDot },
  { v: "escolha_multipla", l: "Escolha múltipla", Icon: CheckSquare },
  { v: "dropdown", l: "Lista suspensa", Icon: ChevronDown },
  { v: "arquivo", l: "Arquivo", Icon: Paperclip },
  { v: "foto", l: "Foto", Icon: ImageIcon },
] as const;

const ehEscolha = (t: string) =>
  t === "escolha_unica" || t === "escolha_multipla" || t === "dropdown";

function gerarSlug(t: string) {
  return (
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) +
    "-" +
    Math.random().toString(36).slice(2, 7)
  );
}

// Visibilidade condicional (mesma regra do formulário público)
function campoVisivel(
  c: Campo,
  valores: Record<string, any>,
  byId: Record<string, Campo>,
  seen: Set<string> = new Set(),
): boolean {
  const cond = c?.condicao;
  if (!cond || !cond.campo_id) return true;
  if (seen.has(c.id)) return true;
  seen.add(c.id);
  const origem = byId[cond.campo_id];
  if (origem && !campoVisivel(origem, valores, byId, seen)) return false;
  const resp = valores[cond.campo_id];
  if (resp === undefined || resp === null || resp === "") return false;
  return cond.operador === "diferente" ? resp !== cond.valor : resp === cond.valor;
}

function Editor() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [modo, setModo] = useState<"editar" | "preview">("editar");
  const [addOpen, setAddOpen] = useState(false);

  const { data: form, isLoading } = useQuery({
    queryKey: ["formulario", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("formularios").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
  const { data: campos = [] } = useQuery({
    queryKey: ["formulario-campos", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formulario_campos")
        .select("*")
        .eq("formulario_id", id)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as unknown as Campo[];
    },
  });

  // --- mutations (otimistas onde a fluidez importa) ---
  const salvarForm = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await supabase.from("formularios").update(patch).eq("id", id);
      if (error) throw error;
    },
    onMutate: async (patch: any) => {
      await qc.cancelQueries({ queryKey: ["formulario", id] });
      const prev = qc.getQueryData<any>(["formulario", id]);
      if (prev) qc.setQueryData(["formulario", id], { ...prev, ...patch });
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["formulario", id], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["formularios"] }),
  });

  const addCampo = useMutation({
    mutationFn: async (tipo: string) => {
      const maxOrdem = campos.reduce((m, c) => Math.max(m, c.ordem), -1);
      const tipoInfo = TIPOS.find((t) => t.v === tipo);
      const { data, error } = await supabase
        .from("formulario_campos")
        .insert({
          formulario_id: id,
          tipo,
          rotulo: tipoInfo?.l ?? "Campo",
          ordem: maxOrdem + 1,
          opcoes: ehEscolha(tipo) ? ["Opção 1", "Opção 2"] : [],
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (cid) => {
      qc.invalidateQueries({ queryKey: ["formulario-campos", id] });
      setSelecionado(cid);
      setAddOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const duplicarCampo = useMutation({
    mutationFn: async (cid: string) => {
      const c = campos.find((x) => x.id === cid);
      if (!c) return null;
      const maxOrdem = campos.reduce((m, x) => Math.max(m, x.ordem), -1);
      const { data, error } = await supabase
        .from("formulario_campos")
        .insert({
          formulario_id: id,
          tipo: c.tipo,
          rotulo: c.rotulo,
          descricao: c.descricao,
          placeholder: c.placeholder,
          obrigatorio: c.obrigatorio,
          opcoes: c.opcoes,
          config: c.config,
          ordem: maxOrdem + 1,
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (cid) => {
      qc.invalidateQueries({ queryKey: ["formulario-campos", id] });
      if (cid) setSelecionado(cid);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateCampo = useMutation({
    mutationFn: async ({ cid, patch }: { cid: string; patch: any }) => {
      const { error } = await supabase.from("formulario_campos").update(patch).eq("id", cid);
      if (error) throw error;
    },
    onMutate: async ({ cid, patch }) => {
      await qc.cancelQueries({ queryKey: ["formulario-campos", id] });
      const prev = qc.getQueryData<Campo[]>(["formulario-campos", id]);
      if (prev)
        qc.setQueryData(
          ["formulario-campos", id],
          prev.map((c) => (c.id === cid ? { ...c, ...patch } : c)),
        );
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["formulario-campos", id], ctx.prev);
      toast.error(e.message);
    },
  });

  const delCampo = useMutation({
    mutationFn: async (cid: string) => {
      const { error } = await supabase.from("formulario_campos").delete().eq("id", cid);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["formulario-campos", id] }),
    onError: (e: any) => toast.error(e.message),
  });

  // reordenação robusta: reatribui ordem sequencial (0..n) a TODOS os campos
  const reordenar = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map((cid, idx) =>
          supabase.from("formulario_campos").update({ ordem: idx }).eq("id", cid),
        ),
      );
    },
    onMutate: async (ids: string[]) => {
      await qc.cancelQueries({ queryKey: ["formulario-campos", id] });
      const prev = qc.getQueryData<Campo[]>(["formulario-campos", id]);
      if (prev) {
        const byId = Object.fromEntries(prev.map((c) => [c.id, c]));
        qc.setQueryData(
          ["formulario-campos", id],
          ids.map((cid, idx) => ({ ...byId[cid], ordem: idx })),
        );
      }
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["formulario-campos", id], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["formulario-campos", id] }),
  });

  const mover = (cid: string, dir: -1 | 1) => {
    const ids = campos.map((c) => c.id);
    const ix = ids.indexOf(cid);
    const j = ix + dir;
    if (ix < 0 || j < 0 || j >= ids.length) return;
    [ids[ix], ids[j]] = [ids[j], ids[ix]];
    reordenar.mutate(ids);
  };

  const publicar = async () => {
    let slug = form?.share_slug;
    if (!slug) slug = gerarSlug(form?.titulo ?? "form");
    await salvarForm.mutateAsync({ status: "publicado", share_slug: slug });
    toast.success("Formulário publicado");
  };

  if (isLoading || !form) return <div className="text-sm text-muted-foreground">Carregando...</div>;

  const publicado = form.status === "publicado";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Barra superior */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button
          onClick={() => navigate({ to: "/painel/formularios" })}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={15} /> Voltar
        </button>

        <div className="flex items-center gap-2 flex-wrap">
          {/* alternância Editar / Pré-visualizar */}
          <div className="inline-flex rounded-lg border p-0.5 bg-card">
            <button
              onClick={() => setModo("editar")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                modo === "editar" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Pencil size={14} /> Editar
            </button>
            <button
              onClick={() => setModo("preview")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                modo === "preview" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Eye size={14} /> Pré-visualizar
            </button>
          </div>

          {publicado && form.publico && form.share_slug && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/f/${form.share_slug}`);
                toast.success("Link público copiado");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-accent"
            >
              <LinkIcon size={14} /> Copiar link
            </button>
          )}
          <Link
            to="/painel/formularios/$id/respostas"
            params={{ id }}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-accent"
          >
            Respostas
          </Link>
          {!publicado ? (
            <button
              onClick={publicar}
              style={{ backgroundImage: FORM_GRAD_BTN, boxShadow: FORM_SHADOW }}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
            >
              <Send size={14} /> Publicar
            </button>
          ) : (
            <button
              onClick={() => salvarForm.mutate({ status: "rascunho" })}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-accent"
            >
              Despublicar
            </button>
          )}
        </div>
      </div>

      {modo === "preview" ? (
        <PreviewForm form={form} campos={campos} onEditar={() => setModo("editar")} />
      ) : (
        <>
          {/* Cabeçalho do formulário */}
          <div className="rounded-2xl border bg-card p-5 shadow-sm border-t-4" style={{ borderTopColor: "#7c3aed" }}>
            <input
              value={form.titulo}
              onChange={(e) => salvarForm.mutate({ titulo: e.target.value })}
              className="w-full text-2xl font-bold bg-transparent border-0 focus:outline-none"
              placeholder="Título do formulário"
            />
            <textarea
              value={form.descricao ?? ""}
              onChange={(e) => salvarForm.mutate({ descricao: e.target.value })}
              rows={1}
              className="mt-1 w-full text-sm bg-transparent border-0 focus:outline-none resize-none text-muted-foreground"
              placeholder="Descrição (opcional)"
            />
            <div className="flex flex-wrap gap-x-5 gap-y-2 pt-3 mt-3 border-t text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={form.publico} onChange={(e) => salvarForm.mutate({ publico: e.target.checked })} />
                Aceitar respostas via link público
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={form.modelo} onChange={(e) => salvarForm.mutate({ modelo: e.target.checked })} />
                Marcar como modelo
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={!!(form as any).no_menu} onChange={(e) => salvarForm.mutate({ no_menu: e.target.checked })} />
                Mostrar no menu de serviços
              </label>
            </div>
            {!!(form as any).no_menu && (
              <div className="flex flex-wrap items-center gap-3 pt-3 text-sm">
                <label className="inline-flex items-center gap-2">
                  <span className="text-muted-foreground">Ícone (emoji):</span>
                  <input
                    value={(form as any).menu_icone ?? ""}
                    onChange={(e) => salvarForm.mutate({ menu_icone: e.target.value })}
                    maxLength={4}
                    placeholder="🔧"
                    className="w-16 rounded-md border bg-background px-2 py-1 text-center"
                  />
                </label>
                <label className="inline-flex items-center gap-2">
                  <span className="text-muted-foreground">Ordem:</span>
                  <input
                    type="number"
                    value={(form as any).menu_ordem ?? 0}
                    onChange={(e) => salvarForm.mutate({ menu_ordem: Number(e.target.value) })}
                    className="w-20 rounded-md border bg-background px-2 py-1"
                  />
                </label>
                <span className="text-xs text-muted-foreground">Aparece em /servicos (precisa estar publicado e público).</span>
              </div>
            )}
          </div>

          {/* Lista de campos (edição inline) */}
          {campos.length === 0 && !addOpen && (
            <div className="rounded-2xl border border-dashed bg-card p-10 text-center shadow-sm">
              <p className="text-sm text-muted-foreground">Nenhuma pergunta ainda.</p>
              <button
                onClick={() => setAddOpen(true)}
                style={{ backgroundImage: FORM_GRAD_BTN }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white"
              >
                <Plus size={15} /> Adicionar primeira pergunta
              </button>
            </div>
          )}

          {campos.map((c, i) => {
            const Info = TIPOS.find((t) => t.v === c.tipo);
            const Icon = Info?.Icon ?? Type;
            const aberto = selecionado === c.id;
            const candidatos = campos.filter(
              (x) => x.id !== c.id && x.ordem < c.ordem && (x.tipo === "escolha_unica" || x.tipo === "dropdown"),
            );
            return (
              <div
                key={c.id}
                className={`rounded-2xl border bg-card shadow-sm transition ${
                  aberto ? "ring-2 ring-violet-500/60" : "hover:border-violet-300"
                }`}
              >
                {/* Cabeçalho do campo (sempre visível) */}
                <button
                  onClick={() => setSelecionado(aberto ? null : c.id)}
                  className="flex w-full items-center gap-3 p-4 text-left"
                >
                  <Icon size={16} className="shrink-0 text-violet-600" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold">{c.rotulo || "(sem título)"}</span>
                      {c.obrigatorio && <span className="text-destructive">*</span>}
                      {c.condicao?.campo_id && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium"
                          style={{ background: "rgba(124,58,237,0.12)", color: "#7c3aed" }}
                        >
                          <GitBranch size={11} /> Condicional
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{Info?.l}</div>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`shrink-0 text-muted-foreground transition ${aberto ? "rotate-180" : ""}`}
                  />
                </button>

                {/* Corpo: pré-visualização (fechado) ou editor (aberto) */}
                {!aberto ? (
                  <div className="px-4 pb-4 -mt-1">
                    <MiniPreview c={c} />
                  </div>
                ) : (
                  <div className="space-y-3 border-t px-4 py-4">
                    <label className="block text-xs">
                      <span className="text-muted-foreground">{c.tipo === "secao" ? "Título da seção" : "Pergunta"}</span>
                      <input
                        value={c.rotulo}
                        onChange={(e) => updateCampo.mutate({ cid: c.id, patch: { rotulo: e.target.value } })}
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        placeholder="Digite aqui"
                      />
                    </label>
                    <label className="block text-xs">
                      <span className="text-muted-foreground">Descrição / ajuda (opcional)</span>
                      <input
                        value={c.descricao ?? ""}
                        onChange={(e) => updateCampo.mutate({ cid: c.id, patch: { descricao: e.target.value } })}
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                      />
                    </label>

                    {/* Opções (escolha/lista) */}
                    {ehEscolha(c.tipo) && (
                      <div className="space-y-1.5">
                        <span className="text-xs text-muted-foreground">Opções</span>
                        {(c.opcoes as string[]).map((op, oi) => (
                          <div key={oi} className="flex items-center gap-1">
                            <input
                              value={op}
                              onChange={(e) => {
                                const novas = [...(c.opcoes as string[])];
                                novas[oi] = e.target.value;
                                updateCampo.mutate({ cid: c.id, patch: { opcoes: novas } });
                              }}
                              className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
                            />
                            <button
                              onClick={() => {
                                const novas = (c.opcoes as string[]).filter((_, j) => j !== oi);
                                updateCampo.mutate({ cid: c.id, patch: { opcoes: novas } });
                              }}
                              className="text-muted-foreground hover:text-destructive"
                              title="Remover opção"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => {
                            const novas = [...(c.opcoes as string[]), `Opção ${(c.opcoes as string[]).length + 1}`];
                            updateCampo.mutate({ cid: c.id, patch: { opcoes: novas } });
                          }}
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
                        >
                          <Plus size={12} /> Adicionar opção
                        </button>
                      </div>
                    )}

                    {/* Foto/arquivo: múltiplos */}
                    {(c.tipo === "foto" || c.tipo === "arquivo") && (
                      <label className="inline-flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={c.tipo === "foto" ? (c.config as any)?.multiplo !== false : !!(c.config as any)?.multiplo}
                          onChange={(e) =>
                            updateCampo.mutate({ cid: c.id, patch: { config: { ...(c.config as any), multiplo: e.target.checked } } })
                          }
                        />
                        Permitir várias {c.tipo === "foto" ? "fotos" : "arquivos"} num campo só
                      </label>
                    )}

                    {/* Lógica condicional */}
                    {c.tipo !== "secao" && (
                      <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold">
                          <GitBranch size={13} className="text-violet-600" /> Lógica condicional
                        </div>
                        {candidatos.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Para mostrar esta pergunta só às vezes, coloque antes dela uma pergunta de escolha
                            única ou lista suspensa.
                          </p>
                        ) : (
                          <>
                            <label className="inline-flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={!!c.condicao}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    const origem = candidatos[0];
                                    const ops = (origem.opcoes as string[]) ?? [];
                                    updateCampo.mutate({
                                      cid: c.id,
                                      patch: { condicao: { campo_id: origem.id, operador: "igual", valor: ops[0] ?? "" } },
                                    });
                                  } else {
                                    updateCampo.mutate({ cid: c.id, patch: { condicao: null } });
                                  }
                                }}
                              />
                              Mostrar esta pergunta só com uma condição
                            </label>
                            {c.condicao &&
                              (() => {
                                const cond = c.condicao!;
                                const origem = campos.find((x) => x.id === cond.campo_id);
                                const ops = (origem?.opcoes as string[]) ?? [];
                                return (
                                  <div className="space-y-2 rounded-md border bg-card p-2 text-xs">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="text-muted-foreground">Mostrar se a resposta de</span>
                                      <select
                                        value={cond.campo_id}
                                        onChange={(e) => {
                                          const novaOrigem = campos.find((x) => x.id === e.target.value);
                                          const novasOps = (novaOrigem?.opcoes as string[]) ?? [];
                                          updateCampo.mutate({
                                            cid: c.id,
                                            patch: { condicao: { ...cond, campo_id: e.target.value, valor: novasOps[0] ?? "" } },
                                          });
                                        }}
                                        className="rounded-md border bg-background px-2 py-1"
                                      >
                                        {candidatos.map((x) => (
                                          <option key={x.id} value={x.id}>
                                            {x.rotulo}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <select
                                        value={cond.operador}
                                        onChange={(e) =>
                                          updateCampo.mutate({ cid: c.id, patch: { condicao: { ...cond, operador: e.target.value } } })
                                        }
                                        className="rounded-md border bg-background px-2 py-1"
                                      >
                                        <option value="igual">for igual a</option>
                                        <option value="diferente">for diferente de</option>
                                      </select>
                                      <select
                                        value={cond.valor}
                                        onChange={(e) =>
                                          updateCampo.mutate({ cid: c.id, patch: { condicao: { ...cond, valor: e.target.value } } })
                                        }
                                        className="flex-1 rounded-md border bg-background px-2 py-1"
                                      >
                                        {ops.map((op, oi) => (
                                          <option key={oi} value={op}>
                                            {op}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                );
                              })()}
                          </>
                        )}
                      </div>
                    )}

                    {/* Rodapé de ações */}
                    <div className="flex items-center justify-between border-t pt-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => mover(c.id, -1)}
                          disabled={i === 0}
                          className="rounded-md border p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
                          title="Mover para cima"
                        >
                          <ChevronUp size={15} />
                        </button>
                        <button
                          onClick={() => mover(c.id, 1)}
                          disabled={i === campos.length - 1}
                          className="rounded-md border p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
                          title="Mover para baixo"
                        >
                          <ChevronDown size={15} />
                        </button>
                        <button
                          onClick={() => duplicarCampo.mutate(c.id)}
                          className="rounded-md border p-1.5 text-muted-foreground hover:bg-accent"
                          title="Duplicar"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        {c.tipo !== "secao" && (
                          <label className="inline-flex items-center gap-1.5 text-xs">
                            <input
                              type="checkbox"
                              checked={c.obrigatorio}
                              onChange={(e) => updateCampo.mutate({ cid: c.id, patch: { obrigatorio: e.target.checked } })}
                            />
                            Obrigatório
                          </label>
                        )}
                        <button
                          onClick={() => {
                            if (confirm("Excluir esta pergunta?")) delCampo.mutate(c.id);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 size={13} /> Excluir
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Adicionar campo */}
          {campos.length > 0 && !addOpen && (
            <button
              onClick={() => setAddOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-4 text-sm font-medium text-muted-foreground hover:border-violet-400 hover:text-violet-600"
            >
              <Plus size={16} /> Adicionar pergunta
            </button>
          )}

          {addOpen && (
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold">Escolha o tipo de pergunta</span>
                <button onClick={() => setAddOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X size={16} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {TIPOS.map((t) => (
                  <button
                    key={t.v}
                    onClick={() => addCampo.mutate(t.v)}
                    className="inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-2.5 text-sm hover:border-violet-400 hover:bg-accent text-left"
                  >
                    <t.Icon size={15} className="shrink-0 text-violet-600" /> {t.l}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- Pré-visualização (fechada): hint não interativo ---------- */
function MiniPreview({ c }: { c: Campo }) {
  if (c.tipo === "secao") return null;
  const box = "w-full rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm text-muted-foreground";
  if (ehEscolha(c.tipo)) {
    return (
      <div className="space-y-1 text-sm text-muted-foreground">
        {(c.opcoes as string[]).slice(0, 4).map((op, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={`inline-block h-3 w-3 border ${c.tipo === "escolha_multipla" ? "rounded-sm" : "rounded-full"}`} />
            {op}
          </div>
        ))}
        {(c.opcoes as string[]).length > 4 && <div className="text-xs">+{(c.opcoes as string[]).length - 4} opções</div>}
      </div>
    );
  }
  if (c.tipo === "foto" || c.tipo === "arquivo")
    return (
      <div className={`${box} flex items-center gap-2`}>
        <Paperclip size={14} /> {c.tipo === "foto" ? "Enviar foto(s)" : "Anexar arquivo(s)"}
      </div>
    );
  return <div className={box}>{c.placeholder || "Resposta de texto"}</div>;
}

/* ---------- Pré-visualização interativa (testar o formulário de verdade) ---------- */
function PreviewForm({ form, campos, onEditar }: { form: any; campos: Campo[]; onEditar: () => void }) {
  const [valores, setValores] = useState<Record<string, any>>({});
  const [arquivos, setArquivos] = useState<Record<string, File[]>>({});
  const byId = Object.fromEntries(campos.map((c) => [c.id, c])) as Record<string, Campo>;
  const visiveis = campos.filter((c) => campoVisivel(c, valores, byId));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 rounded-xl border bg-violet-50 px-4 py-2.5 text-sm">
        <span className="text-violet-800">Pré-visualização — é assim que o colaborador vê. Nada é salvo aqui.</span>
        <button onClick={onEditar} className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1 text-xs font-medium hover:bg-accent">
          <Pencil size={13} /> Voltar a editar
        </button>
      </div>

      <div className="overflow-hidden rounded-3xl border shadow-sm">
        <div className="p-6 text-white" style={{ backgroundImage: FORM_GRAD, boxShadow: FORM_SHADOW }}>
          <h1 className="text-2xl font-bold">{form.titulo || "Formulário"}</h1>
          {form.descricao && <p className="mt-1 text-sm text-white/85">{form.descricao}</p>}
        </div>

        <div className="space-y-4 bg-card p-6">
          {visiveis.length === 0 && <p className="text-sm text-muted-foreground">Adicione perguntas para vê-las aqui.</p>}
          {visiveis.map((c) => (
            <PreviewInput
              key={c.id}
              c={c}
              valor={valores[c.id]}
              onChange={(v) => setValores((s) => ({ ...s, [c.id]: v }))}
              arquivos={arquivos[c.id] ?? []}
              onArquivos={(fs) => setArquivos((s) => ({ ...s, [c.id]: fs }))}
            />
          ))}
          {visiveis.some((c) => c.tipo !== "secao") && (
            <button
              disabled
              style={{ backgroundImage: FORM_GRAD_BTN }}
              className="w-full cursor-not-allowed rounded-xl px-4 py-3 font-semibold text-white opacity-60"
              title="Desativado na pré-visualização"
            >
              Enviar resposta
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewInput({
  c,
  valor,
  onChange,
  arquivos,
  onArquivos,
}: {
  c: Campo;
  valor: any;
  onChange: (v: any) => void;
  arquivos: File[];
  onArquivos: (fs: File[]) => void;
}) {
  if (c.tipo === "secao")
    return (
      <div className="pt-2">
        <h2 className="text-lg font-bold">{c.rotulo}</h2>
        {c.descricao && <p className="text-sm text-muted-foreground">{c.descricao}</p>}
      </div>
    );

  const inp = "mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2";
  const ring = { ["--tw-ring-color" as any]: "#8b5cf6" };

  const Label = (
    <div>
      <span className="text-sm font-medium">
        {c.rotulo} {c.obrigatorio && <span className="text-destructive">*</span>}
      </span>
      {c.descricao && <p className="text-xs text-muted-foreground">{c.descricao}</p>}
    </div>
  );

  const multiploFoto = c.tipo === "foto" ? (c.config as any)?.multiplo !== false : !!(c.config as any)?.multiplo;

  return (
    <div className="rounded-xl border p-4">
      {Label}
      {c.tipo === "texto_longo" && (
        <textarea rows={3} className={inp} style={ring} value={valor ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={c.placeholder ?? ""} />
      )}
      {c.tipo === "texto_curto" && (
        <input className={inp} style={ring} value={valor ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={c.placeholder ?? ""} />
      )}
      {c.tipo === "numero" && (
        <input type="number" className={inp} style={ring} value={valor ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={c.placeholder ?? ""} />
      )}
      {c.tipo === "data" && <input type="date" className={inp} style={ring} value={valor ?? ""} onChange={(e) => onChange(e.target.value)} />}
      {c.tipo === "hora" && <input type="time" className={inp} style={ring} value={valor ?? ""} onChange={(e) => onChange(e.target.value)} />}
      {c.tipo === "datahora" && <input type="datetime-local" className={inp} style={ring} value={valor ?? ""} onChange={(e) => onChange(e.target.value)} />}
      {c.tipo === "dropdown" && (
        <select className={inp} style={ring} value={valor ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">Selecione…</option>
          {(c.opcoes as string[]).map((op, i) => (
            <option key={i} value={op}>
              {op}
            </option>
          ))}
        </select>
      )}
      {c.tipo === "escolha_unica" && (
        <div className="mt-2 space-y-1.5">
          {(c.opcoes as string[]).map((op, i) => (
            <label key={i} className="flex items-center gap-2 text-sm">
              <input type="radio" name={c.id} checked={valor === op} onChange={() => onChange(op)} />
              {op}
            </label>
          ))}
        </div>
      )}
      {c.tipo === "escolha_multipla" && (
        <div className="mt-2 space-y-1.5">
          {(c.opcoes as string[]).map((op, i) => {
            const arr: string[] = Array.isArray(valor) ? valor : [];
            return (
              <label key={i} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={arr.includes(op)}
                  onChange={(e) => onChange(e.target.checked ? [...arr, op] : arr.filter((x) => x !== op))}
                />
                {op}
              </label>
            );
          })}
        </div>
      )}
      {(c.tipo === "foto" || c.tipo === "arquivo") && (
        <div className="mt-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
            <Paperclip size={14} /> {c.tipo === "foto" ? "Adicionar foto" : "Adicionar arquivo"}
            <input
              type="file"
              className="hidden"
              multiple={multiploFoto}
              accept={c.tipo === "foto" ? "image/*" : undefined}
              onChange={(e) => {
                const novos = Array.from(e.target.files ?? []);
                onArquivos(multiploFoto ? [...arquivos, ...novos] : novos.slice(0, 1));
                e.currentTarget.value = "";
              }}
            />
          </label>
          {arquivos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {arquivos.map((f, i) => (
                <div key={i} className="relative">
                  {f.type.startsWith("image/") ? (
                    <Thumb file={f} />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded border bg-muted text-[10px] text-muted-foreground">
                      {f.name.split(".").pop()}
                    </div>
                  )}
                  <button
                    onClick={() => onArquivos(arquivos.filter((_, j) => j !== i))}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-white"
                    title="Remover"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Thumb({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url ? <img src={url} alt="" className="h-16 w-16 rounded border object-cover" /> : null;
}
