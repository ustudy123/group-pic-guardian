import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Archive, Upload, User, X, Loader2, KeyRound, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { criarLoginEncarregado, infoLoginEncarregado, updateUserPassword } from "@/lib/admin.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Props = {
  id: string;
  nome: string;
  grupoNome: string | null;
  fotoUrl?: string | null;
};

export function EditarEncarregadoDialog({ id, nome, grupoNome, fotoUrl }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [nomeVal, setNomeVal] = useState(nome);
  const [grupoVal, setGrupoVal] = useState(grupoNome ?? "");
  const [fotoVal, setFotoVal] = useState<string | null>(fotoUrl ?? null);
  const [telefoneVal, setTelefoneVal] = useState("");
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [confirmArquivar, setConfirmArquivar] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginSenha, setLoginSenha] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);

  // Telefone atual (para alertas/notificações via WhatsApp)
  const { data: extra } = useQuery({
    queryKey: ["encarregado-extra", id],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("encarregados")
        .select("telefone, user_id")
        .eq("id", id)
        .single();
      return data;
    },
  });
  useEffect(() => {
    if (extra) setTelefoneVal(extra.telefone ?? "");
  }, [extra]);

  // Login do portal vinculado (e-mail), visível só para admin
  const { data: login, refetch: refetchLogin } = useQuery({
    queryKey: ["encarregado-login", id],
    enabled: open,
    retry: false,
    queryFn: async () => {
      try {
        return await infoLoginEncarregado({ data: { encarregadoId: id } });
      } catch {
        return null; // usuário não-admin: seção fica oculta
      }
    },
  });

  useEffect(() => {
    if (open) {
      setNomeVal(nome);
      setGrupoVal(grupoNome ?? "");
      setFotoVal(fotoUrl ?? null);
      setLoginEmail("");
      setLoginSenha("");
    }
  }, [open, nome, grupoNome, fotoUrl]);

  async function enviarFoto(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem");
      return;
    }
    setEnviandoFoto(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `encarregados/${id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("fotos-obras")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage
        .from("fotos-obras")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (sErr) throw sErr;
      setFotoVal(signed.signedUrl);
      toast.success("Foto carregada — clique em Salvar para confirmar");
    } catch (e) {
      toast.error("Erro ao enviar foto: " + (e as Error).message);
    } finally {
      setEnviandoFoto(false);
    }
  }

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["painel-encarregados"] });
    qc.invalidateQueries({ queryKey: ["grupos-descobertos"] });
  };

  const salvar = useMutation({
    mutationFn: async () => {
      const novoNome = nomeVal.trim();
      const novoGrupo = grupoVal.trim();
      if (!novoNome) throw new Error("Nome do encarregado é obrigatório");

      const { error } = await supabase
        .from("encarregados")
        .update({
          nome: novoNome,
          grupo_whatsapp_nome: novoGrupo || null,
          foto_url: fotoVal,
          telefone: telefoneVal.replace(/\D/g, "") || null,
        })
        .eq("id", id);
      if (error) throw error;

      if (novoGrupo) {
        const { data: enc } = await supabase
          .from("encarregados")
          .select("grupo_whatsapp_id")
          .eq("id", id)
          .single();
        if (enc?.grupo_whatsapp_id) {
          await supabase
            .from("grupos")
            .update({ nome_exibicao: novoGrupo })
            .eq("whatsapp_jid", enc.grupo_whatsapp_id);
        }
      }
    },
    onSuccess: () => {
      toast.success("Alterações salvas");
      setOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const arquivar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("encarregados")
        .update({ ativo: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Encarregado arquivado");
      setConfirmArquivar(false);
      setOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const criarAcesso = useMutation({
    mutationFn: async () => {
      if (!loginEmail.trim()) throw new Error("Informe o e-mail do login.");
      if (loginSenha.length < 6) throw new Error("A senha precisa de ao menos 6 caracteres.");
      return criarLoginEncarregado({
        data: { encarregadoId: id, email: loginEmail.trim(), password: loginSenha },
      });
    },
    onSuccess: () => {
      toast.success("Acesso ao portal criado");
      setLoginSenha("");
      refetchLogin();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const redefinirSenha = useMutation({
    mutationFn: async () => {
      if (!login?.userId) throw new Error("Sem login vinculado.");
      if (loginSenha.length < 6) throw new Error("A senha precisa de ao menos 6 caracteres.");
      await updateUserPassword({ data: { userId: login.userId, password: loginSenha } });
    },
    onSuccess: () => {
      toast.success("Senha redefinida");
      setLoginSenha("");
    },
    onError: (e: Error) => toast.error(e.message),
  });


  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="absolute top-3 right-3 z-10 inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/25 hover:bg-white/40 text-white backdrop-blur-sm border border-white/30 transition"
        title="Editar"
        aria-label="Editar encarregado"
      >
        <Pencil size={13} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Editar encarregado</DialogTitle>
            <DialogDescription>
              Altere o nome do encarregado e/ou o nome de exibição do grupo do WhatsApp.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              salvar.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Foto do encarregado</Label>
              <div className="flex items-center gap-3">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-muted border flex items-center justify-center shrink-0">
                  {fotoVal ? (
                    <img src={fotoVal} alt={nome} className="w-full h-full object-cover" />
                  ) : (
                    <User size={28} className="text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) enviarFoto(f);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                    disabled={enviandoFoto}
                  >
                    {enviandoFoto ? (
                      <><Loader2 size={14} className="mr-1.5 animate-spin" /> Enviando...</>
                    ) : (
                      <><Upload size={14} className="mr-1.5" /> {fotoVal ? "Trocar foto" : "Enviar foto"}</>
                    )}
                  </Button>
                  {fotoVal && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setFotoVal(null)}
                      disabled={enviandoFoto}
                      className="text-destructive hover:text-destructive"
                    >
                      <X size={14} className="mr-1.5" /> Remover
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="enc-nome">Nome do encarregado</Label>
              <Input
                id="enc-nome"
                value={nomeVal}
                onChange={(e) => setNomeVal(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="enc-grupo">Nome do grupo</Label>
              <Input
                id="enc-grupo"
                value={grupoVal}
                onChange={(e) => setGrupoVal(e.target.value)}
                placeholder="Ex: Obra Centro"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="enc-telefone">
                <Smartphone size={13} className="inline mr-1" />
                Telefone (WhatsApp, com DDD — usado nos avisos de foto reprovada)
              </Label>
              <Input
                id="enc-telefone"
                value={telefoneVal}
                onChange={(e) => setTelefoneVal(e.target.value)}
                placeholder="Ex: 5527999998888"
                inputMode="numeric"
              />
            </div>

            {login !== null && login !== undefined && (
              <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
                <Label className="flex items-center gap-1.5">
                  <KeyRound size={13} /> Acesso ao portal do encarregado
                </Label>
                {login.userId ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Login ativo: <b>{login.email ?? "e-mail não encontrado"}</b>. O encarregado
                      entra em <b>/login</b> e cai no portal dele.
                    </p>
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        value={loginSenha}
                        onChange={(e) => setLoginSenha(e.target.value)}
                        placeholder="Nova senha (mín. 6)"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => redefinirSenha.mutate()}
                        disabled={redefinirSenha.isPending || loginSenha.length < 6}
                      >
                        {redefinirSenha.isPending ? "Salvando..." : "Redefinir senha"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Crie um login para este encarregado acessar o portal (formulários liberados +
                      fotos reprovadas para corrigir).
                    </p>
                    <Input
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="E-mail do encarregado"
                    />
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        value={loginSenha}
                        onChange={(e) => setLoginSenha(e.target.value)}
                        placeholder="Senha (mín. 6)"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => criarAcesso.mutate()}
                        disabled={criarAcesso.isPending}
                      >
                        {criarAcesso.isPending ? "Criando..." : "Criar acesso"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmArquivar(true)}
                disabled={arquivar.isPending}
              >
                <Archive size={14} className="mr-1.5" /> Arquivar
              </Button>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={salvar.isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={salvar.isPending}>
                {salvar.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmArquivar} onOpenChange={setConfirmArquivar}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar encarregado?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold text-foreground">{nome}</span> não aparecerá mais no painel,
              mas as fotos e o histórico ficam preservados. Você pode reativar depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={arquivar.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                arquivar.mutate();
              }}
              disabled={arquivar.isPending}
            >
              {arquivar.isPending ? "Arquivando..." : "Arquivar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  );
}
