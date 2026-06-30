import { createFileRoute, Link, useNavigate, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FORM_GRAD_BTN, FORM_SHADOW } from "@/lib/ui-form";
import {
  ArrowLeft,
  Plus,
  GripVertical,
  Trash2,
  Type,
  AlignLeft,
  Hash,
  Calendar,
  Clock,
  CalendarClock,
  CircleDot,
  CheckSquare,
  ChevronDown,
  Paperclip,
  Image as ImageIcon,
  Heading,
  Save,
  Send,
  Eye,
  Link as LinkIcon,
  GitBranch,
  Copy,
} from "lucide-react";

export const Route = createFileRoute("/painel/formularios/$id")({
  component: EditorWrapper,
});

function EditorWrapper() {
  const loc = useLocation();
  // Se rota filho (respostas) estiver ativa, só renderiza Outlet
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
  { v: "dropdown", l: "Dropdown", Icon: ChevronDown },
  { v: "arquivo", l: "Arquivo", Icon: Paperclip },
  { v: "foto", l: "Foto", Icon: ImageIcon },
] as const;

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

function Editor() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const { data: form, isLoading } = useQuery({
    queryKey: ["formulario", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formularios")
        .select("*")
        .eq("id", id)
        .single();
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

  const salvarForm = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await supabase.from("formularios").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["formulario", id] });
      qc.invalidateQueries({ queryKey: ["formularios"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addCampo = useMutation({
    mutationFn: async (tipo: string) => {
      const ordem = (campos[campos.length - 1]?.ordem ?? -1) + 1;
      const tipoInfo = TIPOS.find((t) => t.v === tipo);
      const { data, error } = await supabase
        .from("formulario_campos")
        .insert({
          formulario_id: id,
          tipo,
          rotulo: tipoInfo?.l ?? "Campo",
          ordem,
          opcoes:
            tipo === "escolha_unica" || tipo === "escolha_multipla" || tipo === "dropdown"
              ? ["Opção 1", "Opção 2"]
              : [],
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (cid) => {
      qc.invalidateQueries({ queryKey: ["formulario-campos", id] });
      setSelecionado(cid);
    },
  });

  const updateCampo = useMutation({
    mutationFn: async ({ cid, patch }: { cid: string; patch: any }) => {
      const { error } = await supabase.from("formulario_campos").update(patch).eq("id", cid);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["formulario-campos", id] }),
  });

  const delCampo = useMutation({
    mutationFn: async (cid: string) => {
      const { error } = await supabase.from("formulario_campos").delete().eq("id", cid);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["formulario-campos", id] }),
  });

  const moverCampo = useMutation({
    mutationFn: async ({ cid, dir }: { cid: string; dir: -1 | 1 }) => {
      const ix = campos.findIndex((c) => c.id === cid);
      const j = ix + dir;
      if (ix < 0 || j < 0 || j >= campos.length) return;
      const a = campos[ix];
      const b = campos[j];
      await supabase.from("formulario_campos").update({ ordem: b.ordem }).eq("id", a.id);
      await supabase.from("formulario_campos").update({ ordem: a.ordem }).eq("id", b.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["formulario-campos", id] }),
  });

  const publicar = async () => {
    let slug = form?.share_slug;
    if (!slug) slug = gerarSlug(form?.titulo ?? "form");
    await salvarForm.mutateAsync({ status: "publicado", share_slug: slug });
    toast.success("Formulário publicado");
  };

  useEffect(() => {
    if (!selecionado && campos[0]) setSelecionado(campos[0].id);
  }, [campos, selecionado]);

  if (isLoading || !form) return <div className="text-sm text-muted-foreground">Carregando...</div>;

  const campoSel = campos.find((c) => c.id === selecionado);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button
          onClick={() => navigate({ to: "/painel/formularios" })}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={15} /> Voltar
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          {form.share_slug && (
            <button
              onClick={() => {
                if (form.status !== "publicado" || !form.publico) {
                  toast.info("Publique o formulário (e marque como público) para abrir a pré-visualização real.");
                  return;
                }
                window.open(`/f/${form.share_slug}`, "_blank");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-accent"
            >
              <Eye size={14} /> Pré-visualizar
            </button>
          )}
          {form.status === "publicado" && form.publico && form.share_slug && (
            <button
              onClick={() => {
                const url = `${window.location.origin}/f/${form.share_slug}`;
                navigator.clipboard.writeText(url);
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
            <Eye size={14} /> Respostas
          </Link>

          {form.status !== "publicado" ? (
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

      <div className="rounded-2xl border bg-card p-4 shadow-md space-y-3">
        <input
          value={form.titulo}
          onChange={(e) => salvarForm.mutate({ titulo: e.target.value })}
          className="w-full text-2xl font-bold bg-transparent border-0 focus:outline-none"
          placeholder="Título do formulário"
        />
        <textarea
          value={form.descricao ?? ""}
          onChange={(e) => salvarForm.mutate({ descricao: e.target.value })}
          rows={2}
          className="w-full text-sm bg-transparent border-0 focus:outline-none resize-none text-muted-foreground"
          placeholder="Descrição (opcional)"
        />
        <div className="flex flex-wrap gap-4 pt-2 border-t text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.publico}
              onChange={(e) => salvarForm.mutate({ publico: e.target.checked })}
            />
            Aceitar respostas via link público
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.modelo}
              onChange={(e) => salvarForm.mutate({ modelo: e.target.checked })}
            />
            Marcar como modelo
          </label>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-2">
          <div className="rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            ✏️ Modo edição — os campos abaixo são apenas pré-visualização. Clique em <b>Pré-visualizar</b> (no topo) para testar o formulário real.
          </div>

          {campos.length === 0 && (
            <div className="rounded-2xl border bg-card p-8 shadow-sm text-center text-sm text-muted-foreground">
              Nenhum campo ainda. Adicione o primeiro usando o painel à direita.
            </div>
          )}
          {campos.map((c, i) => {
            const Info = TIPOS.find((t) => t.v === c.tipo);
            const Icon = Info?.Icon ?? Type;
            const sel = selecionado === c.id;
            return (
              <div
                key={c.id}
                onClick={() => setSelecionado(c.id)}
                className={`rounded-2xl border bg-card p-4 shadow-md cursor-pointer transition ${
                  sel ? "ring-2 ring-primary" : "hover:bg-accent/30"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center text-muted-foreground">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moverCampo.mutate({ cid: c.id, dir: -1 });
                      }}
                      disabled={i === 0}
                      className="disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <GripVertical size={14} />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moverCampo.mutate({ cid: c.id, dir: 1 });
                      }}
                      disabled={i === campos.length - 1}
                      className="disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <Icon size={12} /> {Info?.l}
                      {c.obrigatorio && <span className="text-destructive">*</span>}
                      {c.condicao?.campo_id &&
                        (() => {
                          const origem = campos.find((x) => x.id === c.condicao!.campo_id);
                          const op = c.condicao!.operador === "diferente" ? "≠" : "=";
                          return (
                            <span
                              title={`Mostra só se "${origem?.rotulo ?? "?"}" ${op} "${c.condicao!.valor}"`}
                              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium"
                              style={{ background: "rgba(124,58,237,0.12)", color: "#7c3aed" }}
                            >
                              <GitBranch size={11} /> Condicional
                            </span>
                          );
                        })()}
                    </div>
                    <div className="font-semibold">{c.rotulo}</div>
                    {c.descricao && (
                      <div className="text-xs text-muted-foreground mt-0.5">{c.descricao}</div>
                    )}
                    <PreviewCampo c={c} />
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Excluir campo?")) delCampo.mutate(c.id);
                    }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border bg-card p-3 shadow-md">
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
              Adicionar campo
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {TIPOS.map((t) => (
                <button
                  key={t.v}
                  onClick={() => addCampo.mutate(t.v)}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-xs hover:bg-accent text-left"
                >
                  <t.Icon size={12} /> {t.l}
                </button>
              ))}
            </div>
          </div>

          {campoSel && (
            <div className="rounded-2xl border bg-card p-3 shadow-md space-y-3 sticky top-20">
              <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Configurar campo
              </div>
              <label className="block text-xs">
                <span className="text-muted-foreground">Rótulo</span>
                <input
                  value={campoSel.rotulo}
                  onChange={(e) =>
                    updateCampo.mutate({ cid: campoSel.id, patch: { rotulo: e.target.value } })
                  }
                  className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-xs">
                <span className="text-muted-foreground">Descrição</span>
                <textarea
                  value={campoSel.descricao ?? ""}
                  onChange={(e) =>
                    updateCampo.mutate({ cid: campoSel.id, patch: { descricao: e.target.value } })
                  }
                  rows={2}
                  className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm resize-none"
                />
              </label>
              {campoSel.tipo !== "secao" && (
                <>
                  <label className="block text-xs">
                    <span className="text-muted-foreground">Placeholder</span>
                    <input
                      value={campoSel.placeholder ?? ""}
                      onChange={(e) =>
                        updateCampo.mutate({
                          cid: campoSel.id,
                          patch: { placeholder: e.target.value },
                        })
                      }
                      className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={campoSel.obrigatorio}
                      onChange={(e) =>
                        updateCampo.mutate({
                          cid: campoSel.id,
                          patch: { obrigatorio: e.target.checked },
                        })
                      }
                    />
                    Obrigatório
                  </label>
                </>
              )}
              {(campoSel.tipo === "escolha_unica" ||
                campoSel.tipo === "escolha_multipla" ||
                campoSel.tipo === "dropdown") && (
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">Opções</span>
                  {(campoSel.opcoes as string[]).map((op, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <input
                        value={op}
                        onChange={(e) => {
                          const novas = [...(campoSel.opcoes as string[])];
                          novas[i] = e.target.value;
                          updateCampo.mutate({ cid: campoSel.id, patch: { opcoes: novas } });
                        }}
                        className="flex-1 rounded-md border bg-background px-2 py-1 text-sm"
                      />
                      <button
                        onClick={() => {
                          const novas = (campoSel.opcoes as string[]).filter((_, j) => j !== i);
                          updateCampo.mutate({ cid: campoSel.id, patch: { opcoes: novas } });
                        }}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      const novas = [
                        ...(campoSel.opcoes as string[]),
                        `Opção ${(campoSel.opcoes as string[]).length + 1}`,
                      ];
                      updateCampo.mutate({ cid: campoSel.id, patch: { opcoes: novas } });
                    }}
                    className="text-xs inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-accent"
                  >
                    <Plus size={12} /> Opção
                  </button>
                </div>
              )}
              {(campoSel.tipo === "arquivo" || campoSel.tipo === "foto") && (
                <label className="inline-flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={
                      campoSel.tipo === "foto"
                        ? (campoSel.config as any)?.multiplo !== false
                        : !!(campoSel.config as any)?.multiplo
                    }
                    onChange={(e) =>
                      updateCampo.mutate({
                        cid: campoSel.id,
                        patch: { config: { ...(campoSel.config as any), multiplo: e.target.checked } },
                      })
                    }
                  />
                  Permitir múltiplas {campoSel.tipo === "foto" ? "fotos" : "anexos"}
                </label>
              )}

              {/* Lógica condicional */}
              <div className="border-t pt-3 mt-1 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <GitBranch size={13} /> Lógica condicional
                </div>
                {(() => {
                  const candidatos = campos.filter(
                    (c) =>
                      c.id !== campoSel.id &&
                      c.ordem < campoSel.ordem &&
                      (c.tipo === "escolha_unica" || c.tipo === "dropdown"),
                  );
                  const cond = campoSel.condicao;
                  if (candidatos.length === 0) {
                    return (
                      <p className="text-xs text-muted-foreground">
                        Para exibir este campo condicionalmente, adicione antes dele uma pergunta de
                        escolha única ou dropdown.
                      </p>
                    );
                  }
                  return (
                    <>
                      <label className="inline-flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={!!cond}
                          onChange={(e) => {
                            if (e.target.checked) {
                              const origem = candidatos[0];
                              const ops = (origem.opcoes as string[]) ?? [];
                              updateCampo.mutate({
                                cid: campoSel.id,
                                patch: {
                                  condicao: {
                                    campo_id: origem.id,
                                    operador: "igual",
                                    valor: ops[0] ?? "",
                                  },
                                },
                              });
                            } else {
                              updateCampo.mutate({ cid: campoSel.id, patch: { condicao: null } });
                            }
                          }}
                        />
                        Mostrar este campo só com uma condição
                      </label>

                      {cond &&
                        (() => {
                          const origem = campos.find((c) => c.id === cond.campo_id);
                          const ops = (origem?.opcoes as string[]) ?? [];
                          return (
                            <div className="space-y-2 rounded-md border bg-background p-2 text-xs">
                              <div className="text-muted-foreground">Mostrar somente se a resposta de:</div>
                              <select
                                value={cond.campo_id}
                                onChange={(e) => {
                                  const novaOrigem = campos.find((c) => c.id === e.target.value);
                                  const novasOps = (novaOrigem?.opcoes as string[]) ?? [];
                                  updateCampo.mutate({
                                    cid: campoSel.id,
                                    patch: {
                                      condicao: { ...cond, campo_id: e.target.value, valor: novasOps[0] ?? "" },
                                    },
                                  });
                                }}
                                className="w-full rounded-md border bg-card px-2 py-1"
                              >
                                {candidatos.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.rotulo}
                                  </option>
                                ))}
                              </select>
                              <div className="flex gap-2">
                                <select
                                  value={cond.operador}
                                  onChange={(e) =>
                                    updateCampo.mutate({
                                      cid: campoSel.id,
                                      patch: { condicao: { ...cond, operador: e.target.value } },
                                    })
                                  }
                                  className="rounded-md border bg-card px-2 py-1"
                                >
                                  <option value="igual">for igual a</option>
                                  <option value="diferente">for diferente de</option>
                                </select>
                                <select
                                  value={cond.valor}
                                  onChange={(e) =>
                                    updateCampo.mutate({
                                      cid: campoSel.id,
                                      patch: { condicao: { ...cond, valor: e.target.value } },
                                    })
                                  }
                                  className="flex-1 rounded-md border bg-card px-2 py-1"
                                >
                                  {ops.map((op, i) => (
                                    <option key={i} value={op}>
                                      {op}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          );
                        })()}
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function PreviewCampo({ c }: { c: Campo }) {
  if (c.tipo === "secao") return null;
  const common = "mt-2 w-full rounded-md border bg-background px-2 py-1.5 text-sm pointer-events-none opacity-70";
  switch (c.tipo) {
    case "texto_longo":
      return <textarea className={common} rows={2} placeholder={c.placeholder ?? ""} readOnly />;
    case "numero":
      return <input type="number" className={common} placeholder={c.placeholder ?? ""} readOnly />;
    case "data":
      return <input type="date" className={common} readOnly />;
    case "hora":
      return <input type="time" className={common} readOnly />;
    case "datahora":
      return <input type="datetime-local" className={common} readOnly />;
    case "dropdown":
      return (
        <select className={common} disabled>
          <option>{c.placeholder ?? "Selecione..."}</option>
        </select>
      );
    case "escolha_unica":
    case "escolha_multipla":
      return (
        <div className="mt-2 space-y-1 text-sm opacity-70">
          {(c.opcoes as string[]).slice(0, 4).map((op, i) => (
            <label key={i} className="flex items-center gap-2">
              <input type={c.tipo === "escolha_unica" ? "radio" : "checkbox"} disabled />
              {op}
            </label>
          ))}
        </div>
      );
    case "arquivo":
    case "foto":
      return (
        <div className={`${common} flex items-center gap-2`}>
          <Paperclip size={14} /> {c.tipo === "foto" ? "Enviar foto" : "Anexar arquivo"}
        </div>
      );
    default:
      return <input className={common} placeholder={c.placeholder ?? ""} readOnly />;
  }
}
