import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ClipboardCheck, Download, Loader2, Send } from "lucide-react";
import {
  contarStatus,
  STATUS,
  type ChecklistDia,
  type StatusItem,
} from "@/lib/checklist-fotos";
import {
  definirTipoChecklist,
  enviarChecklistNoGrupo,
  marcarItensChecklist,
  obterChecklistDia,
} from "@/lib/checklist-fotos.functions";
import { gerarImagemChecklist, horaBrasilia } from "@/lib/checklist-imagem";
import { baixar } from "@/lib/exportar-respostas";
import { criarFilaGravacao, type FilaGravacao } from "@/lib/fila-gravacao";

const ESTILO: Record<StatusItem, { ativo: string; inativo: string }> = {
  enviado: {
    ativo: "bg-emerald-600 text-white border-emerald-600",
    inativo: "text-emerald-700 border-emerald-200 hover:bg-emerald-50",
  },
  pendente: {
    ativo: "bg-red-600 text-white border-red-600",
    inativo: "text-red-700 border-red-200 hover:bg-red-50",
  },
  na: {
    ativo: "bg-amber-400 text-amber-950 border-amber-400",
    inativo: "text-amber-800 border-amber-200 hover:bg-amber-50",
  },
  inutilizavel: {
    ativo: "bg-blue-600 text-white border-blue-600",
    inativo: "text-blue-700 border-blue-200 hover:bg-blue-50",
  },
};

const FUNDO_LINHA: Record<StatusItem, string> = {
  enviado: "bg-emerald-50",
  pendente: "bg-red-50/60",
  na: "bg-amber-50",
  inutilizavel: "bg-blue-50",
};

/**
 * Checklist de fotos do dia (só administradores). Fica fixo ao lado das fotos:
 * a pessoa passa o olho nas fotos e marca cada etapa, sem classificar foto
 * por foto (reunião de 16/10 com a equipe de RFO).
 */
export function ChecklistFotosPainel({
  encarregadoId,
  data,
}: {
  encarregadoId: string;
  data: string;
}) {
  const qc = useQueryClient();
  const obter = useServerFn(obterChecklistDia);
  const definirTipo = useServerFn(definirTipoChecklist);
  const marcar = useServerFn(marcarItensChecklist);
  const enviar = useServerFn(enviarChecklistNoGrupo);

  const chave = ["checklist-dia", encarregadoId, data];
  const { data: info, isLoading, error } = useQuery({
    queryKey: chave,
    queryFn: () => obter({ data: { encarregadoId, data } }),
    // Sempre do servidor: guardar a cópia anterior fazia a pasta reaberta em
    // menos de 1 min mostrar o checklist antigo (22/10). A cada 20 s relê,
    // para quem está marcando ver o que outra pessoa marcou.
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 20_000,
  });

  // Estado local = o que a pessoa vê; cada clique salva no servidor em seguida.
  const [checklist, setChecklist] = useState<ChecklistDia | null>(null);
  const [tipoEscolhido, setTipoEscolhido] = useState("");
  const [ocupado, setOcupado] = useState<null | "tipo" | "imagem" | "envio">(null);
  // Fila de gravação: um envio por vez, juntando os cliques feitos enquanto um
  // envio está em andamento (ver fila-gravacao.ts, com testes).
  const [salvando, setSalvando] = useState(false);
  const filaRef = useRef<FilaGravacao<string, StatusItem> | null>(null);
  if (!filaRef.current) {
    filaRef.current = criarFilaGravacao<string, StatusItem>({
      enviar: async (lote) => {
        const salvo = await marcar({
          data: { encarregadoId, data, itens: lote.map(([id, status]) => ({ id, status })) },
        });
        // Só o horário/autor: a lista na tela já tem a marcação mais nova.
        setChecklist((c) =>
          c ? { ...c, atualizado_em: salvo.atualizado_em, atualizado_por: salvo.atualizado_por } : c,
        );
      },
      aoFalhar: async (e) => {
        toast.error(`Não salvou: ${(e as Error).message}. A tela foi recarregada com o que está salvo.`);
        const atual = await obter({ data: { encarregadoId, data } }).catch(() => null);
        if (atual) setChecklist(atual.checklist);
      },
      aoMudarEstado: (enviando) => {
        setSalvando(enviando);
        if (!enviando) qc.invalidateQueries({ queryKey: ["checklists-do-dia", data] });
      },
    });
  }
  const fila = filaRef.current;

  useEffect(() => {
    if (!info) return;
    if (filaRef.current?.ocupada()) return; // não pisa no que ainda está sendo salvo
    const doServidor = info.checklist;
    setChecklist((local) => {
      // Só troca a tela por uma versão MAIS NOVA que a dela: uma releitura que
      // saiu antes do último clique chega com a versão velha e seria ignorada.
      if (!local || !doServidor) return doServidor ?? local;
      if (doServidor.tipo_id !== local.tipo_id) return doServidor;
      return new Date(doServidor.atualizado_em) > new Date(local.atualizado_em) ? doServidor : local;
    });
    setTipoEscolhido((t) => doServidor?.tipo_id ?? (t || info.tipoSugerido || info.tipos[0]?.id || ""));
  }, [info]);

  // Aviso ao fechar a aba com marcação ainda sendo salva.
  useEffect(() => {
    if (!salvando) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [salvando]);


  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 size={14} className="animate-spin" /> Carregando checklist…
      </div>
    );
  }
  if (error || !info) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm text-red-700">
        Não foi possível abrir o checklist: {(error as Error)?.message ?? "erro desconhecido"}
      </div>
    );
  }

  const trocarTipo = async (tipoId: string) => {
    if (checklist && tipoId !== checklist.tipo_id) {
      const nome = info.tipos.find((t) => t.id === tipoId)?.nome ?? "";
      if (!confirm(`Trocar o checklist de hoje para "${nome}"? O que já foi marcado em itens com o mesmo nome é mantido.`)) {
        setTipoEscolhido(checklist.tipo_id);
        return;
      }
    }
    setOcupado("tipo");
    try {
      await fila.esvaziar(); // termina de salvar as marcações antes de trocar o tipo
      const novo = await definirTipo({ data: { encarregadoId, data, tipoId } });
      setChecklist(novo);
      setTipoEscolhido(novo.tipo_id);
      qc.invalidateQueries({ queryKey: ["checklists-do-dia", data] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };


  const mudarStatus = (itens: { id: string; status: StatusItem }[]) => {
    if (!checklist) return;
    const novos = new Map(itens.map((i) => [i.id, i.status]));
    // Atualização em cima do estado mais recente (dois cliques seguidos antes
    // de a tela redesenhar não se anulam).
    setChecklist((c) =>
      c ? { ...c, itens: c.itens.map((i) => (novos.has(i.id) ? { ...i, status: novos.get(i.id)! } : i)) } : c,
    );
    void fila.adicionar(novos);
  };

  const imagemAtual = async () => {
    await fila.esvaziar(); // espera as marcações em andamento
    // A imagem sai do que está SALVO (inclui o que outra pessoa marcou), não
    // só do que esta tela mostra.
    const salvo = (await obter({ data: { encarregadoId, data } })).checklist;
    if (!salvo) throw new Error("Sem checklist salvo para este dia.");
    setChecklist(salvo);
    const img = await gerarImagemChecklist({ ...salvo, atualizado_em: new Date().toISOString() });
    return { ...img, salvo };
  };

  const baixarImagem = async () => {
    setOcupado("imagem");
    try {
      const { blob, salvo } = await imagemAtual();
      baixar(blob, `Checklist ${salvo.encarregado_nome} ${data}.png`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  const enviarNoGrupo = async () => {
    if (!checklist) return;
    if (!confirm(`Enviar o checklist de ${checklist.encarregado_nome} no grupo de WhatsApp dele?`)) return;
    setOcupado("envio");
    try {
      const { base64, salvo } = await imagemAtual();
      const n = contarStatus(salvo); // o que está salvo, igual à imagem
      const partes = [
        n.pendente > 0 ? `faltam ${n.pendente} foto(s), marcadas em vermelho` : "",
        n.inutilizavel > 0 ? `${n.inutilizavel} foto(s) precisam ser enviadas de novo (em azul, não deu para usar)` : "",
      ].filter(Boolean);
      const legenda = partes.length
        ? `📋 Checklist de fotos de hoje — ${partes.join("; ")}.`
        : "📋 Checklist de fotos de hoje — tudo enviado. Obrigado!";
      const r = await enviar({ data: { encarregadoId, data, imagemBase64: base64, legenda } });
      setChecklist((c) => (c ? { ...c, enviado_grupo_em: new Date().toISOString() } : c));
      toast.success(`Checklist enviado no grupo${r.grupo ? ` "${r.grupo}"` : ""}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  const n = checklist ? contarStatus(checklist) : null;

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="p-3 border-b space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold flex items-center gap-1.5">
            <ClipboardCheck size={16} /> Checklist do dia
          </h2>
          <Link to="/painel/checklist" search={{ data }} className="text-xs text-muted-foreground hover:text-foreground underline">
            Ver todos
          </Link>
        </div>
        <div className="flex gap-2">
          <select
            value={tipoEscolhido}
            onChange={(e) => {
              setTipoEscolhido(e.target.value);
              if (checklist) trocarTipo(e.target.value);
            }}
            disabled={ocupado === "tipo"}
            className="flex-1 min-w-0 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            {info.tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
                {!checklist && t.id === info.tipoSugerido ? " (último usado)" : ""}
              </option>
            ))}
          </select>
          {!checklist && (
            <button
              onClick={() => trocarTipo(tipoEscolhido)}
              disabled={!tipoEscolhido || ocupado === "tipo"}
              className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {ocupado === "tipo" ? <Loader2 size={14} className="animate-spin" /> : "Começar"}
            </button>
          )}
        </div>
        {!checklist && (
          <p className="text-xs text-muted-foreground">
            Escolha o tipo de serviço que ele está fazendo hoje. Todos os itens começam como pendentes.
          </p>
        )}
        {checklist && n && (
          <div className="grid grid-cols-4 gap-1 text-center text-[11px] font-semibold leading-tight">
            <span className="rounded bg-emerald-50 text-emerald-700 py-1">{n.enviado} enviada(s)</span>
            <span className="rounded bg-red-50 text-red-700 py-1">{n.pendente} pendente(s)</span>
            <span className="rounded bg-amber-50 text-amber-800 py-1">{n.na} NA</span>
            <span className="rounded bg-blue-50 text-blue-700 py-1">{n.inutilizavel} não utiliz.</span>
          </div>
        )}
      </div>

      {checklist && (
        <>
          <ul className="divide-y text-sm">
            {checklist.itens.map((item) => (
              <li key={item.id} className={`flex items-center gap-2 px-3 py-1.5 ${FUNDO_LINHA[item.status]}`}>
                <span className="flex-1 min-w-0 leading-tight">{item.nome}</span>
                <div className="flex shrink-0 gap-1">
                  {STATUS.map((s) => (
                    <button
                      key={s.valor}
                      onClick={() => item.status !== s.valor && mudarStatus([{ id: item.id, status: s.valor }])}
                      title={s.rotulo}
                      aria-pressed={item.status === s.valor}
                      className={`w-7 h-7 rounded border text-xs font-bold transition ${
                        item.status === s.valor ? ESTILO[s.valor].ativo : `bg-background ${ESTILO[s.valor].inativo}`
                      }`}
                    >
                      {s.curto}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <div className="p-3 border-t space-y-2">
            {n && n.pendente > 0 && (
              <button
                onClick={() => {
                  if (confirm(`Marcar os ${n.pendente} item(ns) pendente(s) como "Não se aplica"?`))
                    mudarStatus(
                      checklist.itens.filter((i) => i.status === "pendente").map((i) => ({ id: i.id, status: "na" })),
                    );
                }}
                className="w-full rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
              >
                Marcar pendentes como "Não se aplica"
              </button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={baixarImagem}
                disabled={ocupado !== null}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
              >
                {ocupado === "imagem" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                Baixar imagem
              </button>
              <button
                onClick={enviarNoGrupo}
                disabled={ocupado !== null || !info.temGrupo}
                title={info.temGrupo ? "Manda a imagem no grupo de WhatsApp do encarregado" : "Encarregado sem grupo cadastrado"}
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 text-white px-2 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                {ocupado === "envio" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Enviar no grupo
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {salvando ? (
                <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                  <Loader2 size={11} className="animate-spin" /> Salvando…
                </span>
              ) : (
                <>Salvo às {horaBrasilia(checklist.atualizado_em)}</>
              )}
              {checklist.atualizado_por ? ` por ${checklist.atualizado_por}` : ""}
              {checklist.enviado_grupo_em ? ` · enviado no grupo às ${horaBrasilia(checklist.enviado_grupo_em)}` : ""}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
