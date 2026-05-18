import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Archive, Trash2, Upload, User, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [confirmArquivar, setConfirmArquivar] = useState(false);
  const [confirmExcluir, setConfirmExcluir] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setNomeVal(nome);
      setGrupoVal(grupoNome ?? "");
      setFotoVal(fotoUrl ?? null);
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

  const excluir = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("encarregados").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Encarregado excluído");
      setConfirmExcluir(false);
      setOpen(false);
      invalidate();
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

            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmArquivar(true)}
                disabled={arquivar.isPending || excluir.isPending}
              >
                <Archive size={14} className="mr-1.5" /> Arquivar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmExcluir(true)}
                disabled={arquivar.isPending || excluir.isPending}
                className="text-destructive hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
              >
                <Trash2 size={14} className="mr-1.5" /> Excluir
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

      <AlertDialog open={confirmExcluir} onOpenChange={setConfirmExcluir}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold text-foreground">{nome}</span> será removido do banco. As fotos
              já armazenadas continuam existentes, mas ficarão sem vínculo. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluir.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                excluir.mutate();
              }}
              disabled={excluir.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {excluir.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
