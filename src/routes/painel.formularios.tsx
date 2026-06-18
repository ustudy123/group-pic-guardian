import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Folder,
  FolderPlus,
  FilePlus,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Trash2,
  FileText,
  Eye,
  Copy,
  Link as LinkIcon,
  Archive,
} from "lucide-react";

export const Route = createFileRoute("/painel/formularios")({
  component: FormulariosLayout,
});

function FormulariosLayout() {
  const loc = useLocation();
  const isDetail = /\/painel\/formularios\/[^/]+/.test(loc.pathname);
  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary to-[color:var(--primary-glow)] text-primary-foreground p-6 md:p-8 shadow-sm">
        <div className="absolute -right-12 -top-12 w-56 h-56 rounded-full bg-white/5 blur-2xl" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground/80">
            <span className="w-6 h-px bg-primary-foreground/60" /> Formulários
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight mt-1">
            Construtor de formulários
          </h1>
          <p className="text-sm text-primary-foreground/80 mt-1 max-w-2xl">
            Crie formulários organizados por pastas, anexe arquivos, compartilhe por link público
            e reutilize modelos prontos.
          </p>
        </div>
      </div>
      {!isDetail && <ListaFormularios />}
      <Outlet />
    </div>
  );
}

type Pasta = { id: string; nome: string; cor: string | null; ordem: number };
type Form = {
  id: string;
  titulo: string;
  descricao: string | null;
  pasta_id: string | null;
  status: string;
  publico: boolean;
  modelo: boolean;
  share_slug: string | null;
  updated_at: string;
};

type PromptState = {
  title: string;
  label?: string;
  initial?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
} | null;

type ConfirmState = {
  title: string;
  message?: string;
  destructive?: boolean;
  confirmLabel?: string;
  onConfirm: () => void;
} | null;

function ListaFormularios() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [pastaAberta, setPastaAberta] = useState<Record<string, boolean>>({});
  const [promptDlg, setPromptDlg] = useState<PromptState>(null);
  const [confirmDlg, setConfirmDlg] = useState<ConfirmState>(null);

  const { data: pastas = [] } = useQuery({
    queryKey: ["form-pastas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("form_pastas")
        .select("*")
        .order("ordem")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Pasta[];
    },
  });
  const { data: forms = [] } = useQuery({
    queryKey: ["formularios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formularios")
        .select("id,titulo,descricao,pasta_id,status,publico,modelo,share_slug,updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Form[];
    },
  });

  const criarPastaMut = useMutation({
    mutationFn: async (nome: string) => {
      const { error } = await supabase.from("form_pastas").insert({ nome });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["form-pastas"] });
      toast.success("Pasta criada");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const renomearPastaMut = useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
      const { error } = await supabase.from("form_pastas").update({ nome }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["form-pastas"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const excluirPastaMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("form_pastas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["form-pastas"] });
      qc.invalidateQueries({ queryKey: ["formularios"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const criarFormMut = useMutation({
    mutationFn: async ({ titulo, pasta_id }: { titulo: string; pasta_id: string | null }) => {
      const { data, error } = await supabase
        .from("formularios")
        .insert({ titulo, pasta_id })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["formularios"] });
      window.location.href = `/painel/formularios/${id}`;
    },
    onError: (e: any) => toast.error(e.message),
  });

  const abrirCriarPasta = () =>
    setPromptDlg({
      title: "Nova pasta",
      label: "Nome da pasta",
      confirmLabel: "Criar",
      onConfirm: (v) => criarPastaMut.mutate(v),
    });
  const abrirRenomearPasta = (p: Pasta) =>
    setPromptDlg({
      title: "Renomear pasta",
      label: "Nome da pasta",
      initial: p.nome,
      confirmLabel: "Salvar",
      onConfirm: (v) => renomearPastaMut.mutate({ id: p.id, nome: v }),
    });
  const abrirExcluirPasta = (id: string) =>
    setConfirmDlg({
      title: "Excluir pasta?",
      message: "Os formulários ficarão sem pasta.",
      destructive: true,
      confirmLabel: "Excluir",
      onConfirm: () => excluirPastaMut.mutate(id),
    });
  const abrirNovoForm = (pasta_id: string | null) =>
    setPromptDlg({
      title: "Novo formulário",
      label: "Nome do formulário",
      confirmLabel: "Criar",
      onConfirm: (v) => criarFormMut.mutate({ titulo: v, pasta_id }),
    });

  const moverForm = useMutation({
    mutationFn: async ({ id, pasta_id }: { id: string; pasta_id: string | null }) => {
      const { error } = await supabase.from("formularios").update({ pasta_id }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["formularios"] }),
  });

  const clonarForm = useMutation({
    mutationFn: async (id: string) => {
      const { data: f } = await supabase.from("formularios").select("*").eq("id", id).single();
      const { data: cs } = await supabase
        .from("formulario_campos")
        .select("*")
        .eq("formulario_id", id);
      if (!f) return;
      const { id: _, share_slug, created_at, updated_at, ...rest } = f as any;
      const { data: novo, error } = await supabase
        .from("formularios")
        .insert({ ...rest, titulo: `${f.titulo} (cópia)`, status: "rascunho", share_slug: null })
        .select("id")
        .single();
      if (error) throw error;
      if (cs?.length) {
        await supabase.from("formulario_campos").insert(
          cs.map((c: any) => {
            const { id: _, created_at, updated_at, ...r } = c;
            return { ...r, formulario_id: novo.id };
          }),
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["formularios"] });
      toast.success("Formulário clonado");
    },
  });

  const excluirFormMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("formularios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["formularios"] }),
    onError: (e: any) => toast.error(e.message),
  });
  const abrirExcluirForm = (id: string) =>
    setConfirmDlg({
      title: "Excluir formulário?",
      message: "Todas as respostas também serão removidas.",
      destructive: true,
      confirmLabel: "Excluir",
      onConfirm: () => excluirFormMut.mutate(id),
    });

  const formsFiltrados = forms.filter(
    (f) => !busca || f.titulo.toLowerCase().includes(busca.toLowerCase()),
  );
  const semPasta = formsFiltrados.filter((f) => !f.pasta_id);
  const porPasta = (pid: string) => formsFiltrados.filter((f) => f.pasta_id === pid);

  return (
    <div className="space-y-6">
      <PromptDialog state={promptDlg} onClose={() => setPromptDlg(null)} />
      <ConfirmDialog state={confirmDlg} onClose={() => setConfirmDlg(null)} />
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar formulário..."
          className="flex-1 min-w-[200px] rounded-lg border bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={abrirCriarPasta}
          className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
        >
          <FolderPlus size={15} /> Nova pasta
        </button>
        <button
          onClick={() => abrirNovoForm(null)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold hover:opacity-90"
        >
          <FilePlus size={15} /> Novo formulário
        </button>
      </div>

      <section>
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-2">
          Pastas
        </h2>
        <div className="rounded-xl border bg-card divide-y">
          {pastas.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nenhuma pasta criada ainda.
            </div>
          )}
          {pastas.map((p) => {
            const itens = porPasta(p.id);
            const aberta = pastaAberta[p.id] ?? false;
            return (
              <div key={p.id}>
                <div className="flex items-center gap-2 p-3 hover:bg-accent/40">
                  <button
                    onClick={() => setPastaAberta({ ...pastaAberta, [p.id]: !aberta })}
                    className="text-muted-foreground"
                  >
                    {aberta ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <Folder size={16} style={{ color: p.cor ?? "#3b82f6" }} />
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{p.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {itens.length} formulário{itens.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <button
                    onClick={() => abrirNovoForm(p.id)}
                    className="text-xs inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-accent"
                    title="Adicionar formulário a esta pasta"
                  >
                    <FilePlus size={12} /> Form
                  </button>
                  <button
                    onClick={() => abrirRenomearPasta(p)}
                    className="text-muted-foreground hover:text-foreground p-1"
                    title="Renomear"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => abrirExcluirPasta(p.id)}
                    className="text-muted-foreground hover:text-destructive p-1"
                    title="Excluir"
                  >
                    <Trash2 size={14} />
                  </button>

                </div>
                {aberta && (
                  <div className="bg-muted/30 px-3 py-2 space-y-1">
                    {itens.length === 0 && (
                      <div className="text-xs text-muted-foreground italic px-2 py-2">
                        Pasta vazia.
                      </div>
                    )}
                    {itens.map((f) => (
                      <CardForm
                        key={f.id}
                        f={f}
                        pastas={pastas}
                        onMover={(pid) => moverForm.mutate({ id: f.id, pasta_id: pid })}
                        onClonar={() => clonarForm.mutate(f.id)}
                        onExcluir={() => excluirForm.mutate(f.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-2">
          Formulários {semPasta.length > 0 ? "(sem pasta)" : ""}
        </h2>
        <div className="rounded-xl border bg-card divide-y">
          {semPasta.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nenhum formulário sem pasta.
            </div>
          )}
          {semPasta.map((f) => (
            <CardForm
              key={f.id}
              f={f}
              pastas={pastas}
              onMover={(pid) => moverForm.mutate({ id: f.id, pasta_id: pid })}
              onClonar={() => clonarForm.mutate(f.id)}
              onExcluir={() => excluirForm.mutate(f.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function CardForm({
  f,
  pastas,
  onMover,
  onClonar,
  onExcluir,
}: {
  f: Form;
  pastas: Pasta[];
  onMover: (pid: string | null) => void;
  onClonar: () => void;
  onExcluir: () => void;
}) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="flex items-center gap-2 p-3 hover:bg-accent/40 rounded-lg">
      <FileText size={16} className="text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/painel/formularios/$id" params={{ id: f.id }} className="font-semibold text-sm hover:underline truncate">
            {f.titulo}
          </Link>
          <Badge status={f.status} />
          {f.publico && <Badge status="publico" />}
          {f.modelo && <Badge status="modelo" />}
        </div>
        {f.descricao && (
          <div className="text-xs text-muted-foreground truncate">{f.descricao}</div>
        )}
      </div>
      {f.share_slug && f.publico && f.status === "publicado" && (
        <button
          onClick={() => {
            const url = `${window.location.origin}/f/${f.share_slug}`;
            navigator.clipboard.writeText(url);
            toast.success("Link copiado");
          }}
          className="text-xs inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-accent"
          title="Copiar link público"
        >
          <LinkIcon size={12} /> Link
        </button>
      )}
      <Link
        to="/painel/formularios/$id/respostas"
        params={{ id: f.id }}
        className="text-xs inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-accent"
        title="Ver respostas"
      >
        <Eye size={12} /> Respostas
      </Link>
      <div className="relative">
        <button
          onClick={() => setMenu(!menu)}
          className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-accent"
        >
          <MoreHorizontal size={16} />
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
            <div className="absolute right-0 top-full mt-1 z-20 w-52 rounded-lg border bg-popover shadow-lg p-1 text-sm">
              <div className="px-2 py-1 text-[10px] uppercase font-bold text-muted-foreground">
                Mover para pasta
              </div>
              <button
                onClick={() => {
                  onMover(null);
                  setMenu(false);
                }}
                className="w-full text-left px-2 py-1.5 hover:bg-accent rounded"
              >
                — Sem pasta —
              </button>
              {pastas.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onMover(p.id);
                    setMenu(false);
                  }}
                  className="w-full text-left px-2 py-1.5 hover:bg-accent rounded flex items-center gap-2"
                >
                  <Folder size={12} /> {p.nome}
                </button>
              ))}
              <div className="border-t my-1" />
              <button
                onClick={() => {
                  onClonar();
                  setMenu(false);
                }}
                className="w-full text-left px-2 py-1.5 hover:bg-accent rounded flex items-center gap-2"
              >
                <Copy size={12} /> Clonar
              </button>
              <button
                onClick={() => {
                  onExcluir();
                  setMenu(false);
                }}
                className="w-full text-left px-2 py-1.5 hover:bg-accent rounded flex items-center gap-2 text-destructive"
              >
                <Trash2 size={12} /> Excluir
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const map: Record<string, string> = {
    rascunho: "bg-muted text-muted-foreground",
    publicado: "bg-emerald-100 text-emerald-700",
    arquivado: "bg-orange-100 text-orange-700",
    publico: "bg-blue-100 text-blue-700",
    modelo: "bg-purple-100 text-purple-700",
  };
  return (
    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${map[status] ?? ""}`}>
      {status}
    </span>
  );
}
