import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function NovoEncarregadoDialog() {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [grupoId, setGrupoId] = useState("");
  const [grupoNome, setGrupoNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("encarregados").insert({
        nome: nome.trim(),
        grupo_whatsapp_id: grupoId.trim(),
        grupo_whatsapp_nome: grupoNome.trim() || null,
        telefone: telefone.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Encarregado cadastrado");
      setOpen(false);
      setNome("");
      setGrupoId("");
      setGrupoNome("");
      setTelefone("");
      qc.invalidateQueries({ queryKey: ["painel-encarregados"] });
    },
    onError: (e: Error) => toast.error("Erro ao cadastrar: " + e.message),
  });

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
      >
        + Novo encarregado
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              if (!nome.trim() || !grupoId.trim()) {
                toast.error("Nome e ID do grupo são obrigatórios");
                return;
              }
              mutation.mutate();
            }}
            className="bg-card border rounded-lg w-full max-w-md p-6 space-y-4"
          >
            <h2 className="text-lg font-semibold">Novo encarregado</h2>

            <div className="space-y-1">
              <label className="text-sm font-medium">Nome *</label>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">ID do grupo WhatsApp *</label>
              <input
                value={grupoId}
                onChange={(e) => setGrupoId(e.target.value)}
                placeholder="ex: 120363425812896864-group"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Nome amigável do grupo</label>
              <input
                value={grupoNome}
                onChange={(e) => setGrupoNome(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Telefone</label>
              <input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:opacity-90 disabled:opacity-50"
              >
                {mutation.isPending ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
