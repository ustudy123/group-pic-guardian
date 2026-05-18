import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sincronizarGruposZapi } from "@/lib/grupos.functions";
import { Users, ArrowLeft, Check, RotateCcw, RefreshCw, Archive, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/painel/grupos")({
  component: GruposDescobertos,
});

type GrupoDescoberto = {
  id: string;
  whatsapp_jid: string;
  nome_exibicao: string;
  ultima_foto_em: string | null;
  ativo: boolean;
  ja_ativado: boolean;
};

function sugerirNome(nomeGrupo: string): string {
  // Extrai possível nome do encarregado de "Fotos Wilson", "Equipe Carlos", etc.
  const limpo = nomeGrupo
    .replace(/^(fotos|equipe|grupo|obra|frente|time)\s+(de\s+|do\s+|da\s+)?/i, "")
    .trim();
  return limpo || nomeGrupo;
}

function GruposDescobertos() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nomeEnc, setNomeEnc] = useState("");
  const [arquivarAlvo, setArquivarAlvo] = useState<GrupoDescoberto | null>(null);
  const [excluirAlvo, setExcluirAlvo] = useState<GrupoDescoberto | null>(null);

  const { data: podeExcluir = false } = useQuery({
    queryKey: ["pode-excluir-grupos"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user?.email?.toLowerCase() === "wallasmonteiro019@gmail.com";
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["grupos-descobertos"],
    queryFn: async (): Promise<GrupoDescoberto[]> => {
      const [{ data: grupos, error: ge }, { data: encs, error: ee }] = await Promise.all([
        supabase
          .from("grupos")
          .select("id, whatsapp_jid, nome_exibicao, ultima_foto_em, ativo")
          .order("ultima_foto_em", { ascending: false, nullsFirst: false }),
        supabase.from("encarregados").select("grupo_whatsapp_id").eq("ativo", true),
      ]);
      if (ge) throw ge;
      if (ee) throw ee;
      const ativadosSet = new Set((encs ?? []).map((e) => e.grupo_whatsapp_id));
      return (grupos ?? []).map((g) => ({
        ...g,
        ja_ativado: ativadosSet.has(g.whatsapp_jid),
      }));
    },
  });

  const ativar = useMutation({
    mutationFn: async (args: { jid: string; nomeGrupo: string; nome: string }) => {
      const { error } = await supabase.from("encarregados").insert({
        nome: args.nome.trim(),
        grupo_whatsapp_id: args.jid,
        grupo_whatsapp_nome: args.nomeGrupo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Encarregado ativado");
      setEditingId(null);
      setNomeEnc("");
      qc.invalidateQueries({ queryKey: ["grupos-descobertos"] });
      qc.invalidateQueries({ queryKey: ["painel-encarregados"] });
      qc.invalidateQueries({ queryKey: ["grupos-pendentes-count"] });
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });

  const setAtivo = useMutation({
    mutationFn: async (args: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("grupos")
        .update({ ativo: args.ativo })
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.ativo ? "Grupo reativado" : "Grupo arquivado");
      qc.invalidateQueries({ queryKey: ["grupos-descobertos"] });
      qc.invalidateQueries({ queryKey: ["grupos-pendentes-count"] });
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("grupos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Grupo excluído permanentemente");
      qc.invalidateQueries({ queryKey: ["grupos-descobertos"] });
      qc.invalidateQueries({ queryKey: ["grupos-pendentes-count"] });
    },
    onError: (e: Error) => toast.error("Erro ao excluir: " + e.message),
  });

  const sincronizarFn = useServerFn(sincronizarGruposZapi);
  const sincronizar = useMutation({
    mutationFn: () => sincronizarFn({ data: undefined as never }),
    onSuccess: (r) => {
      toast.success(
        `Sincronização concluída: ${r.criados} novo(s), ${r.atualizados} atualizado(s)`,
      );
      qc.invalidateQueries({ queryKey: ["grupos-descobertos"] });
      qc.invalidateQueries({ queryKey: ["grupos-pendentes-count"] });
    },
    onError: (e: Error) => toast.error("Falha ao sincronizar: " + e.message),
  });

  const pendentes = (data ?? []).filter((g) => g.ativo && !g.ja_ativado);
  const ativados = (data ?? []).filter((g) => g.ativo && g.ja_ativado);
  const recusados = (data ?? []).filter((g) => !g.ativo);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/painel"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} /> Voltar
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight">Grupos descobertos</h1>
          <p className="text-muted-foreground text-sm">
            Grupos do WhatsApp em que o bot foi adicionado. Ative cada um informando o nome do encarregado.
          </p>
        </div>
        <button
          onClick={() => sincronizar.mutate()}
          disabled={sincronizar.isPending}
          className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-accent transition disabled:opacity-50"
          title="Buscar todos os grupos diretamente da Z-API"
        >
          <RefreshCw size={14} className={sincronizar.isPending ? "animate-spin" : ""} />
          {sincronizar.isPending ? "Sincronizando..." : "Sincronizar do WhatsApp"}
        </button>
      </div>

      {isLoading && <div className="text-muted-foreground">Carregando...</div>}

      {!isLoading && pendentes.length === 0 && ativados.length === 0 && (
        <div className="border rounded-2xl p-10 text-center bg-card">
          <p className="text-muted-foreground">
            Nenhum grupo detectado ainda. Adicione o número do bot em um grupo do WhatsApp e envie qualquer
            mensagem — ele aparecerá aqui automaticamente.
          </p>
        </div>
      )}

      {pendentes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Aguardando ativação ({pendentes.length})
          </h2>
          <div className="grid gap-3">
            {pendentes.map((g) => (
              <div
                key={g.id}
                className="border rounded-xl bg-card p-4 flex items-center gap-4 flex-wrap"
              >
                <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <Users size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{g.nome_exibicao}</div>
                  <div className="text-xs text-muted-foreground font-mono truncate">{g.whatsapp_jid}</div>
                  {g.ultima_foto_em && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Última foto:{" "}
                      {new Date(g.ultima_foto_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    </div>
                  )}
                </div>

                {editingId === g.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!nomeEnc.trim()) return;
                      ativar.mutate({ jid: g.whatsapp_jid, nomeGrupo: g.nome_exibicao, nome: nomeEnc });
                    }}
                    className="flex gap-2 items-center"
                  >
                    <input
                      autoFocus
                      value={nomeEnc}
                      onChange={(e) => setNomeEnc(e.target.value)}
                      placeholder="Nome do encarregado"
                      className="rounded-md border border-input bg-background px-3 py-1.5 text-sm w-52"
                    />
                    <button
                      type="submit"
                      disabled={ativar.isPending}
                      className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      {ativar.isPending ? "..." : "Salvar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setNomeEnc("");
                      }}
                      className="text-sm text-muted-foreground hover:text-foreground px-2"
                    >
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2">
                    {podeExcluir && (
                      <button
                        onClick={() => setExcluirAlvo(g)}
                        disabled={excluir.isPending}
                        className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-2 text-sm hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition disabled:opacity-50"
                        title="Excluir permanentemente"
                      >
                        <Trash2 size={14} /> Excluir
                      </button>
                    )}
                    <button
                      onClick={() => setArquivarAlvo(g)}
                      disabled={setAtivo.isPending}
                      className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent transition disabled:opacity-50"
                      title="Arquivar (pode reativar depois)"
                    >
                      <Archive size={14} /> Arquivar
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(g.id);
                        setNomeEnc(sugerirNome(g.nome_exibicao));
                      }}
                      className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
                    >
                      Ativar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {ativados.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Já ativados ({ativados.length})
          </h2>
          <div className="grid gap-2">
            {ativados.map((g) => (
              <div
                key={g.id}
                className="border rounded-lg bg-muted/40 p-3 flex items-center gap-3 text-sm"
              >
                <Check size={16} className="text-emerald-600 shrink-0" />
                <span className="flex-1 truncate">{g.nome_exibicao}</span>
                <span className="text-xs text-muted-foreground font-mono truncate hidden sm:inline">
                  {g.whatsapp_jid}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {recusados.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Arquivados ({recusados.length})
          </h2>
          <div className="grid gap-2">
            {recusados.map((g) => (
              <div
                key={g.id}
                className="border rounded-lg bg-muted/20 p-3 flex items-center gap-3 text-sm opacity-70"
              >
                <Archive size={16} className="text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{g.nome_exibicao}</span>
                <button
                  onClick={() => setAtivo.mutate({ id: g.id, ativo: true })}
                  disabled={setAtivo.isPending}
                  className="inline-flex items-center gap-1 text-xs rounded-md border border-input px-2.5 py-1 hover:bg-accent transition disabled:opacity-50"
                >
                  <RotateCcw size={12} /> Reativar
                </button>
                {podeExcluir && (
                  <button
                    onClick={() => setExcluirAlvo(g)}
                    disabled={excluir.isPending}
                    className="inline-flex items-center gap-1 text-xs rounded-md border border-input px-2.5 py-1 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition disabled:opacity-50"
                  >
                    <Trash2 size={12} /> Excluir
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <AlertDialog open={!!arquivarAlvo} onOpenChange={(o) => !o && setArquivarAlvo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar este grupo?</AlertDialogTitle>
            <AlertDialogDescription>
              O grupo <span className="font-semibold text-foreground">{arquivarAlvo?.nome_exibicao}</span> não
              aparecerá mais como pendente. Você pode reativá-lo depois na seção "Arquivados".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (arquivarAlvo) setAtivo.mutate({ id: arquivarAlvo.id, ativo: false });
                setArquivarAlvo(null);
              }}
            >
              Arquivar grupo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!excluirAlvo} onOpenChange={(o) => !o && setExcluirAlvo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              O grupo <span className="font-semibold text-foreground">{excluirAlvo?.nome_exibicao}</span> será
              removido do banco de dados. Se ele continuar existindo no WhatsApp, voltará a aparecer na
              próxima sincronização. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (excluirAlvo) excluir.mutate(excluirAlvo.id);
                setExcluirAlvo(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir grupo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
