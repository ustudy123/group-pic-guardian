import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Trash2, UserPlus, FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listContratos, upsertContrato, deleteContrato,
  listBairros, upsertBairro, deleteBairro,
  listRuas, upsertRua, deleteRua,
  listAtribuicoesRua, addAtribuicao, removeAtribuicao,
} from "@/lib/vistorias.functions";
import { gerarRelatorioBairro, listRelatoriosBairro } from "@/lib/relatorios.functions";

export const Route = createFileRoute("/painel/vistorias/admin")({
  component: AdminVistorias,
});

function AdminVistorias() {
  const qc = useQueryClient();
  const listC = useServerFn(listContratos);
  const upC = useServerFn(upsertContrato);
  const delC = useServerFn(deleteContrato);

  const { data: cData } = useQuery({ queryKey: ["v-contratos"], queryFn: () => listC() });
  const contratos = (cData?.contratos ?? []) as any[];

  const [contratoId, setContratoId] = useState<string | null>(null);
  const [novoContrato, setNovoContrato] = useState("");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Contratos */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <h3 className="font-bold">Contratos</h3>
        <div className="flex gap-2">
          <input
            value={novoContrato}
            onChange={(e) => setNovoContrato(e.target.value)}
            placeholder="Nº do contrato (ex: CT 018/2025)"
            className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
          <button
            onClick={async () => {
              if (!novoContrato.trim()) return;
              try {
                await upC({ data: { numero: novoContrato.trim() } });
                setNovoContrato("");
                qc.invalidateQueries({ queryKey: ["v-contratos"] });
              } catch (e: any) { toast.error(e.message); }
            }}
            className="rounded-md bg-primary text-primary-foreground px-3 text-sm"
          ><Plus size={14} /></button>
        </div>
        <ul className="space-y-1">
          {contratos.map((c) => (
            <li key={c.id} className={`flex items-center justify-between rounded-md border px-2 py-1.5 cursor-pointer text-sm ${contratoId === c.id ? "bg-primary/10 border-primary" : ""}`}
                onClick={() => setContratoId(c.id)}>
              <span className="truncate">{c.numero}</span>
              <button onClick={async (e) => { e.stopPropagation(); if (confirm("Excluir contrato?")) { await delC({ data: { id: c.id } }); qc.invalidateQueries({ queryKey: ["v-contratos"] }); } }}
                className="text-muted-foreground hover:text-destructive"><Trash2 size={13} /></button>
            </li>
          ))}
          {contratos.length === 0 && <li className="text-xs text-muted-foreground">Nenhum contrato.</li>}
        </ul>
      </div>

      <BairrosPanel contratoId={contratoId} />
    </div>
  );
}

function BairrosPanel({ contratoId }: { contratoId: string | null }) {
  const qc = useQueryClient();
  const listB = useServerFn(listBairros);
  const upB = useServerFn(upsertBairro);
  const delB = useServerFn(deleteBairro);
  const { data } = useQuery({
    queryKey: ["v-bairros", contratoId],
    queryFn: () => listB({ data: { contratoId: contratoId! } }),
    enabled: !!contratoId,
  });
  const [novo, setNovo] = useState("");
  const [bairroId, setBairroId] = useState<string | null>(null);
  const bairros = (data?.bairros ?? []) as any[];

  if (!contratoId) return <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Selecione um contrato.</div>;

  return (
    <>
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <h3 className="font-bold">Bairros</h3>
        <div className="flex gap-2">
          <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Nome do bairro"
            className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
          <button
            onClick={async () => {
              if (!novo.trim()) return;
              await upB({ data: { contrato_id: contratoId, nome: novo.trim() } });
              setNovo("");
              qc.invalidateQueries({ queryKey: ["v-bairros", contratoId] });
            }}
            className="rounded-md bg-primary text-primary-foreground px-3 text-sm"><Plus size={14} /></button>
        </div>
        <ul className="space-y-1">
          {bairros.map((b) => (
            <li key={b.id} className={`flex items-center justify-between rounded-md border px-2 py-1.5 cursor-pointer text-sm ${bairroId === b.id ? "bg-primary/10 border-primary" : ""}`}
                onClick={() => setBairroId(b.id)}>
              <span className="truncate">{b.nome}</span>
              <button onClick={async (e) => { e.stopPropagation(); if (confirm("Excluir?")) { await delB({ data: { id: b.id } }); qc.invalidateQueries({ queryKey: ["v-bairros", contratoId] }); } }}
                className="text-muted-foreground hover:text-destructive"><Trash2 size={13} /></button>
            </li>
          ))}
          {bairros.length === 0 && <li className="text-xs text-muted-foreground">Nenhum bairro.</li>}
        </ul>
      </div>
      <RuasPanel bairroId={bairroId} />
    </>
  );
}

function RuasPanel({ bairroId }: { bairroId: string | null }) {
  const qc = useQueryClient();
  const listR = useServerFn(listRuas);
  const upR = useServerFn(upsertRua);
  const delR = useServerFn(deleteRua);
  const { data } = useQuery({
    queryKey: ["v-ruas", bairroId],
    queryFn: () => listR({ data: { bairroId: bairroId! } }),
    enabled: !!bairroId,
  });
  const [novo, setNovo] = useState("");
  const [ruaSel, setRuaSel] = useState<string | null>(null);
  const ruas = (data?.ruas ?? []) as any[];

  if (!bairroId) return <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Selecione um bairro.</div>;

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <h3 className="font-bold">Ruas</h3>
      <div className="flex gap-2">
        <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Nome da rua"
          className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
        <button
          onClick={async () => {
            if (!novo.trim()) return;
            await upR({ data: { bairro_id: bairroId, nome: novo.trim() } });
            setNovo("");
            qc.invalidateQueries({ queryKey: ["v-ruas", bairroId] });
          }}
          className="rounded-md bg-primary text-primary-foreground px-3 text-sm"><Plus size={14} /></button>
      </div>
      <ul className="space-y-1">
        {ruas.map((r) => (
          <li key={r.id} className="rounded-md border px-2 py-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="truncate">{r.nome}</span>
              <div className="flex gap-1">
                <button onClick={() => setRuaSel(ruaSel === r.id ? null : r.id)} className="text-primary hover:underline text-xs inline-flex items-center gap-1"><UserPlus size={12}/> Vistoriantes</button>
                <button onClick={async () => { if (confirm("Excluir?")) { await delR({ data: { id: r.id } }); qc.invalidateQueries({ queryKey: ["v-ruas", bairroId] }); } }}
                  className="text-muted-foreground hover:text-destructive"><Trash2 size={13}/></button>
              </div>
            </div>
            {ruaSel === r.id && <AtribuicoesRua ruaId={r.id} />}
          </li>
        ))}
        {ruas.length === 0 && <li className="text-xs text-muted-foreground">Nenhuma rua.</li>}
      </ul>
    </div>
  );
}

function AtribuicoesRua({ ruaId }: { ruaId: string }) {
  const qc = useQueryClient();
  const listA = useServerFn(listAtribuicoesRua);
  const addA = useServerFn(addAtribuicao);
  const remA = useServerFn(removeAtribuicao);
  const { data } = useQuery({
    queryKey: ["v-atrib", ruaId],
    queryFn: () => listA({ data: { ruaId } }),
  });
  const { data: usersData } = useQuery({
    queryKey: ["v-users-all"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, email, display_name").order("email");
      return data ?? [];
    },
  });
  const [sel, setSel] = useState("");
  const atrib = (data?.atribuicoes ?? []) as any[];
  const users = usersData ?? [];

  return (
    <div className="mt-2 pt-2 border-t space-y-2">
      <div className="flex gap-1">
        <select value={sel} onChange={(e) => setSel(e.target.value)} className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs">
          <option value="">— escolher usuário —</option>
          {users.map((u: any) => <option key={u.id} value={u.id}>{u.email}</option>)}
        </select>
        <button
          onClick={async () => {
            if (!sel) return;
            try {
              await addA({ data: { ruaId, vistorianteId: sel } });
              setSel("");
              qc.invalidateQueries({ queryKey: ["v-atrib", ruaId] });
            } catch (e: any) { toast.error(e.message); }
          }}
          className="rounded-md bg-primary text-primary-foreground px-2 text-xs">+</button>
      </div>
      <ul className="space-y-1">
        {atrib.map((a) => (
          <li key={a.id} className="flex items-center justify-between text-xs">
            <span>{a.profiles?.email}</span>
            <button onClick={async () => { await remA({ data: { id: a.id } }); qc.invalidateQueries({ queryKey: ["v-atrib", ruaId] }); }}
              className="text-destructive"><Trash2 size={11}/></button>
          </li>
        ))}
        {atrib.length === 0 && <li className="text-xs text-muted-foreground">Nenhum atribuído.</li>}
      </ul>
    </div>
  );
}
