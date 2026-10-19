import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ClipboardCheck,
  FileSpreadsheet,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { useRoles } from "@/lib/use-roles";
import {
  TIPOS_PADRAO,
  contarStatus,
  novoId,
  type ChecklistDia,
  type StatusItem,
  type TipoChecklist,
} from "@/lib/checklist-fotos";
import {
  checklistsDoDia,
  diasComChecklist,
  obterTiposChecklist,
  salvarTiposChecklist,
} from "@/lib/checklist-fotos.functions";
import { dataPorExtenso } from "@/lib/checklist-imagem";
import { ESTILO_XLSX, gerarXlsxColorido, type CelulaXlsx } from "@/lib/xlsx-colorido";
import { baixar } from "@/lib/exportar-respostas";

const hojeBrasilia = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

export const Route = createFileRoute("/painel/checklist")({
  validateSearch: (s: Record<string, unknown>): { data?: string } => ({
    data: typeof s.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.data) ? s.data : undefined,
  }),
  component: ChecklistPage,
});

const SIMBOLO: Record<StatusItem, string> = { enviado: "X", pendente: "-", na: "NA" };
const COR_CELULA: Record<StatusItem, string> = {
  enviado: "bg-emerald-100 text-emerald-800",
  pendente: "bg-red-100 text-red-800",
  na: "bg-amber-100 text-amber-900",
};

/** Agrupa os checklists do dia por tipo, como as seções da planilha antiga. */
function agruparPorTipo(checklists: ChecklistDia[], tipos: TipoChecklist[]) {
  const ordemTipo = new Map(tipos.map((t, i) => [t.nome, i]));
  const grupos = new Map<string, ChecklistDia[]>();
  for (const c of checklists) {
    const lista = grupos.get(c.tipo_nome) ?? [];
    lista.push(c);
    grupos.set(c.tipo_nome, lista);
  }
  return [...grupos.entries()]
    .sort((a, b) => (ordemTipo.get(a[0]) ?? 99) - (ordemTipo.get(b[0]) ?? 99))
    .map(([tipo, lista]) => {
      lista.sort((a, b) => a.encarregado_nome.localeCompare(b.encarregado_nome, "pt-BR"));
      // Itens na ordem do primeiro checklist; nomes que só existem em outro entram no fim.
      const itens: string[] = [];
      for (const c of lista) for (const i of c.itens) if (!itens.includes(i.nome)) itens.push(i.nome);
      return { tipo, checklists: lista, itens };
    });
}

function abaDoDia(data: string, checklists: ChecklistDia[], tipos: TipoChecklist[]) {
  const E = ESTILO_XLSX;
  const linhas: CelulaXlsx[][] = [
    [{ v: `CONTROLE DE CHECKLIST - RFO — ${dataPorExtenso(data)}`, s: E.titulo }],
    [
      { v: "X = Enviado", s: E.verde },
      { v: "- = Não enviado", s: E.vermelho },
      { v: "NA = Não se aplica", s: E.amarelo },
    ],
    [],
  ];
  let maxCols = 3;
  for (const g of agruparPorTipo(checklists, tipos)) {
    maxCols = Math.max(maxCols, g.checklists.length + 1);
    linhas.push([
      { v: g.tipo.toUpperCase(), s: E.cabecalho },
      ...g.checklists.map((c) => ({ v: c.encarregado_nome.toUpperCase(), s: E.cabecalho })),
    ]);
    for (const nome of g.itens) {
      linhas.push([
        { v: nome, s: E.item },
        ...g.checklists.map((c) => {
          const it = c.itens.find((i) => i.nome === nome);
          if (!it) return { v: "", s: E.item };
          const s = it.status === "enviado" ? E.verde : it.status === "na" ? E.amarelo : E.vermelho;
          return { v: SIMBOLO[it.status], s };
        }),
      ]);
    }
    linhas.push([]);
  }
  if (checklists.length === 0) linhas.push([{ v: "Nenhum checklist preenchido neste dia.", s: E.nota }]);
  return { nome: data.slice(8, 10), linhas, larguras: [38, ...Array(maxCols - 1).fill(14)] };
}

function ChecklistPage() {
  const { isAdmin, loading } = useRoles();
  const [aba, setAba] = useState<"dia" | "tipos">("dia");

  if (loading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!isAdmin) {
    return <p className="text-sm text-muted-foreground">O checklist de fotos é só para administradores.</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardCheck size={22} /> Checklist de fotos
        </h1>
        <p className="text-sm text-muted-foreground">
          Marque o checklist na pasta do dia de cada encarregado. Aqui ficam todas as equipes do
          dia, a exportação em Excel e os tipos de checklist.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {([
          ["dia", "Visão do dia"],
          ["tipos", "Tipos de checklist"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setAba(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              aba === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {aba === "dia" ? <VisaoDoDia /> : <EditorTipos />}
    </div>
  );
}

function VisaoDoDia() {
  const { data: dataBusca } = Route.useSearch();
  const navigate = useNavigate({ from: "/painel/checklist" });
  const data = dataBusca ?? hojeBrasilia();
  const doDia = useServerFn(checklistsDoDia);
  const dias = useServerFn(diasComChecklist);
  const obterTipos = useServerFn(obterTiposChecklist);
  const [exportando, setExportando] = useState<null | "dia" | "mes">(null);

  const { data: info, isLoading } = useQuery({
    queryKey: ["checklists-do-dia", data],
    queryFn: () => doDia({ data: { data } }),
  });
  const { data: tiposInfo } = useQuery({ queryKey: ["checklist-tipos"], queryFn: () => obterTipos() });
  const tipos = tiposInfo?.tipos ?? TIPOS_PADRAO;

  const grupos = useMemo(() => agruparPorTipo(info?.checklists ?? [], tipos), [info, tipos]);
  const semChecklist = useMemo(() => {
    const feitos = new Set((info?.checklists ?? []).map((c) => c.encarregado_id));
    return (info?.encarregados ?? []).filter((e) => !feitos.has(e.id));
  }, [info]);

  const exportar = async (tipo: "dia" | "mes") => {
    setExportando(tipo);
    try {
      let abas;
      if (tipo === "dia") {
        abas = [abaDoDia(data, info?.checklists ?? [], tipos)];
      } else {
        const { dias: lista } = await dias({ data: { anoMes: data.slice(0, 7) } });
        if (lista.length === 0) throw new Error("Nenhum checklist preenchido neste mês.");
        abas = [];
        for (let i = 0; i < lista.length; i++) {
          toast.loading(`Montando o mês — dia ${i + 1} de ${lista.length}`, { id: "export-checklist" });
          const r = await doDia({ data: { data: lista[i] } });
          abas.push(abaDoDia(lista[i], r.checklists, tipos));
        }
      }
      const blob = await gerarXlsxColorido(abas);
      const [a, m, d] = data.split("-");
      baixar(blob, tipo === "dia" ? `Checklist de Fotos ${d}-${m}-${a}.xlsx` : `Checklist de Fotos ${m}-${a}.xlsx`);
      toast.success("Planilha gerada", { id: "export-checklist" });
    } catch (e) {
      toast.error((e as Error).message, { id: "export-checklist" });
    } finally {
      setExportando(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={data}
          onChange={(e) => e.target.value && navigate({ search: { data: e.target.value } })}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <span className="text-sm text-muted-foreground">{dataPorExtenso(data)}</span>
        <div className="flex-1" />
        <button
          onClick={() => exportar("dia")}
          disabled={exportando !== null || isLoading}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
        >
          {exportando === "dia" ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
          Excel do dia
        </button>
        <button
          onClick={() => exportar("mes")}
          disabled={exportando !== null}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90 disabled:opacity-50"
        >
          {exportando === "mes" ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
          Excel do mês (uma aba por dia)
        </button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!isLoading && grupos.length === 0 && (
        <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          Nenhum checklist preenchido neste dia. Abra a pasta do dia de um encarregado para começar.
        </p>
      )}

      {grupos.map((g) => (
        <div key={g.tipo} className="rounded-xl border bg-card overflow-x-auto">
          <table className="text-sm border-collapse min-w-full">
            <thead>
              <tr className="bg-muted/60">
                <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-muted min-w-[220px]">
                  {g.tipo.toUpperCase()}
                </th>
                {g.checklists.map((c) => {
                  const n = contarStatus(c);
                  return (
                    <th key={c.encarregado_id} className="px-2 py-2 font-semibold text-center min-w-[96px]">
                      <Link
                        to="/painel/$encarregado/$anoMes/$dia"
                        params={{ encarregado: c.encarregado_nome, anoMes: data.slice(0, 7), dia: data.slice(8, 10) }}
                        className="hover:underline uppercase"
                      >
                        {c.encarregado_nome}
                      </Link>
                      <div className="text-[10px] font-normal text-muted-foreground">
                        {n.pendente > 0 ? `${n.pendente} pendente(s)` : "completo"}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {g.itens.map((nome) => (
                <tr key={nome} className="border-t">
                  <td className="px-3 py-1.5 sticky left-0 bg-card">{nome}</td>
                  {g.checklists.map((c) => {
                    const it = c.itens.find((i) => i.nome === nome);
                    return (
                      <td
                        key={c.encarregado_id}
                        className={`text-center font-bold border-l ${it ? COR_CELULA[it.status] : ""}`}
                      >
                        {it ? SIMBOLO[it.status] : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {semChecklist.length > 0 && (
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <h3 className="text-sm font-semibold">Sem checklist neste dia ({semChecklist.length})</h3>
          <div className="flex flex-wrap gap-1.5">
            {semChecklist.map((e) => (
              <Link
                key={e.id}
                to="/painel/$encarregado/$anoMes/$dia"
                params={{ encarregado: e.nome, anoMes: data.slice(0, 7), dia: data.slice(8, 10) }}
                className="rounded-full border px-2.5 py-1 text-xs hover:bg-accent"
              >
                {e.nome}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EditorTipos() {
  const qc = useQueryClient();
  const obter = useServerFn(obterTiposChecklist);
  const salvar = useServerFn(salvarTiposChecklist);
  const { data: info, isLoading } = useQuery({ queryKey: ["checklist-tipos"], queryFn: () => obter() });
  const [tipos, setTipos] = useState<TipoChecklist[] | null>(null);
  const [alterado, setAlterado] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (info && !tipos) setTipos(info.tipos);
  }, [info, tipos]);

  if (isLoading || !tipos) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const mudar = (f: (t: TipoChecklist[]) => TipoChecklist[]) => {
    setTipos((t) => (t ? f(t) : t));
    setAlterado(true);
  };
  const mudarTipo = (id: string, f: (t: TipoChecklist) => TipoChecklist) =>
    mudar((ts) => ts.map((t) => (t.id === id ? f(t) : t)));
  const mover = <T,>(lista: T[], i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= lista.length) return lista;
    const n = [...lista];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  };

  const gravar = async () => {
    const limpos = tipos
      .map((t) => ({ ...t, nome: t.nome.trim(), itens: t.itens.filter((i) => i.nome.trim()).map((i) => ({ ...i, nome: i.nome.trim() })) }))
      .filter((t) => t.nome && t.itens.length > 0);
    if (limpos.length === 0) {
      toast.error("Deixe pelo menos um tipo com itens.");
      return;
    }
    setSalvando(true);
    try {
      await salvar({ data: { tipos: limpos } });
      setTipos(limpos);
      setAlterado(false);
      qc.invalidateQueries({ queryKey: ["checklist-tipos"] });
      qc.invalidateQueries({ queryKey: ["checklist-dia"] });
      toast.success("Tipos de checklist salvos");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-sm text-muted-foreground">
        Mudanças aqui valem para os próximos checklists. Os dias já preenchidos guardam os itens da
        época e não mudam.
      </p>
      {tipos.map((t, ti) => (
        <div key={t.id} className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <input
              value={t.nome}
              onChange={(e) => mudarTipo(t.id, (x) => ({ ...x, nome: e.target.value }))}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold"
            />
            <button onClick={() => mudar((ts) => mover(ts, ti, -1))} className="p-2 text-muted-foreground" title="Subir">
              <ArrowUp size={14} />
            </button>
            <button onClick={() => mudar((ts) => mover(ts, ti, 1))} className="p-2 text-muted-foreground" title="Descer">
              <ArrowDown size={14} />
            </button>
            <button
              onClick={() => confirm(`Excluir o tipo "${t.nome}"?`) && mudar((ts) => ts.filter((x) => x.id !== t.id))}
              className="p-2 text-destructive"
              title="Excluir tipo"
            >
              <Trash2 size={15} />
            </button>
          </div>
          <ul className="space-y-1">
            {t.itens.map((it, ii) => (
              <li key={it.id} className="flex items-center gap-1.5">
                <span className="w-6 text-right text-xs text-muted-foreground">{ii + 1}.</span>
                <input
                  value={it.nome}
                  onChange={(e) =>
                    mudarTipo(t.id, (x) => ({
                      ...x,
                      itens: x.itens.map((y) => (y.id === it.id ? { ...y, nome: e.target.value } : y)),
                    }))
                  }
                  className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm"
                />
                <button onClick={() => mudarTipo(t.id, (x) => ({ ...x, itens: mover(x.itens, ii, -1) }))} className="p-1 text-muted-foreground" title="Subir">
                  <ArrowUp size={13} />
                </button>
                <button onClick={() => mudarTipo(t.id, (x) => ({ ...x, itens: mover(x.itens, ii, 1) }))} className="p-1 text-muted-foreground" title="Descer">
                  <ArrowDown size={13} />
                </button>
                <button
                  onClick={() => mudarTipo(t.id, (x) => ({ ...x, itens: x.itens.filter((y) => y.id !== it.id) }))}
                  className="p-1 text-destructive"
                  title="Remover item"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={() => mudarTipo(t.id, (x) => ({ ...x, itens: [...x.itens, { id: novoId(x.id), nome: "" }] }))}
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-accent"
          >
            <Plus size={12} /> Adicionar item
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => mudar((ts) => [...ts, { id: novoId("tipo"), nome: "Novo tipo", itens: [{ id: novoId("item"), nome: "Localização" }] }])}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
        >
          <Plus size={14} /> Novo tipo
        </button>
        <button
          onClick={() => confirm("Voltar aos 5 tipos da planilha original? As mudanças não salvas se perdem.") && (setTipos(TIPOS_PADRAO), setAlterado(true))}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
        >
          <RotateCcw size={14} /> Restaurar padrão da planilha
        </button>
        <button
          onClick={gravar}
          disabled={!alterado || salvando}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar tipos
        </button>
      </div>
    </div>
  );
}
