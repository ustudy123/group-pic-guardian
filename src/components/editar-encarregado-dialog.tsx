import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Props = {
  id: string;
  nome: string;
  grupoNome: string | null;
};

export function EditarEncarregadoDialog({ id, nome, grupoNome }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [nomeVal, setNomeVal] = useState(nome);
  const [grupoVal, setGrupoVal] = useState(grupoNome ?? "");

  useEffect(() => {
    if (open) {
      setNomeVal(nome);
      setGrupoVal(grupoNome ?? "");
    }
  }, [open, nome, grupoNome]);

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
        })
        .eq("id", id);
      if (error) throw error;

      // Atualiza também o nome de exibição do grupo se houver vínculo
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
      qc.invalidateQueries({ queryKey: ["painel-encarregados"] });
      qc.invalidateQueries({ queryKey: ["grupos-descobertos"] });
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
        className="absolute top-3 right-16 z-10 inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/25 hover:bg-white/40 text-white backdrop-blur-sm border border-white/30 transition"
        title="Editar"
        aria-label="Editar encarregado"
      >
        <Pencil size={13} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
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
    </>
  );
}
