import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ArrowLeft, Trash2, CheckCircle2, XCircle, Clock, RotateCcw, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { FotoCaptura } from "@/components/foto-captura";
import { BadgeStatusRua, ContadoresRua } from "@/components/progresso-rua";
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
import {
  getRua,
  listFotosRua,
  deleteFoto,
  setFotoStatus,
  aprovarFotosRua,
  getMyRoles,
} from "@/lib/vistorias.functions";

export const Route = createFileRoute("/painel/vistorias/$ruaId")({
  component: RuaPage,
});

function RuaPage() {
  const { ruaId } = Route.useParams();
  const qc = useQueryClient();
  const getRuaFn = useServerFn(getRua);
  const listFn = useServerFn(listFotosRua);
  const delFn = useServerFn(deleteFoto);
  const statusFn = useServerFn(setFotoStatus);
  const aprovarTodasFn = useServerFn(aprovarFotosRua);
  const rolesFn = useServerFn(getMyRoles);

  const { data: ruaData } = useQuery({
    queryKey: ["rua", ruaId],
    queryFn: () => getRuaFn({ data: { ruaId } }),
  });
  const { data: fotosData, refetch } = useQuery({
    queryKey: ["fotos-rua", ruaId],
    queryFn: () => listFn({ data: { ruaId } }),
  });
  const { data: rolesData } = useQuery({
    queryKey: ["my-roles"],
    queryFn: () => rolesFn(),
  });

  const [fase, setFase] = useState<"pre" | "pos">("pre");
  const [tipo, setTipo] = useState<"rua" | "casa">("rua");
  const [numeroCasa, setNumeroCasa] = useState("");
  const [lado, setLado] = useState<"E" | "D">("D");
  const [parPreId, setParPreId] = useState<string | null>(null);
  const [rejeitarId, setRejeitarId] = useState<string | null>(null);
  const [aprovarTodasFase, setAprovarTodasFase] = useState<"pre" | "pos" | null>(null);

  const fotos = (fotosData?.fotos ?? []) as any[];
  const fotosPre = useMemo(() => fotos.filter((f) => f.fase === "pre"), [fotos]);
  const fotosPos = useMemo(() => fotos.filter((f) => f.fase === "pos"), [fotos]);
  const fotosPreRua = useMemo(() => fotosPre.filter((f) => f.tipo === "rua"), [fotosPre]);
  const refFoto = parPreId ? fotos.find((f) => f.id === parPreId) : null;

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta foto?")) return;
    await delFn({ data: { fotoId: id } });
    toast.success("Foto excluída");
    refetch();
    qc.invalidateQueries({ queryKey: ["fotos-rua", ruaId] });
  }
  async function handleStatus(id: string, status: "pendente" | "aprovada" | "rejeitada") {
    await statusFn({ data: { fotoId: id, status } });
    toast.success(
      status === "aprovada" ? "Foto aprovada" : status === "rejeitada" ? "Foto rejeitada" : "Status revertido",
    );
    refetch();
  }

  async function handleAprovarTodas(faseAlvo: "pre" | "pos") {
    const res = await aprovarTodasFn({ data: { ruaId, fase: faseAlvo } });
    toast.success(`${res.aprovadas} foto(s) aprovada(s)`);
    refetch();
    setAprovarTodasFase(null);
  }

  const pendentesPre = fotosPre.filter((f) => f.status === "pendente").length;
  const pendentesPos = fotosPos.filter((f) => f.status === "pendente").length;
  const rua = (ruaData?.rua as any) ?? null;
  const podeAprovar = rolesData?.isPrivileged ?? false;

  return (
    <div className="space-y-5">
      <Link to="/painel/vistorias" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Voltar
      </Link>

      {rua && (
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs text-muted-foreground">
                Contrato {rua.bairros?.contratos?.numero} · {rua.bairros?.nome}
              </div>
              <div className="text-2xl font-bold capitalize">{rua.nome}</div>
            </div>
            <BadgeStatusRua p={ruaData?.progresso} />
          </div>
          <ContadoresRua p={ruaData?.progresso} />
        </div>
      )}

      {/* Tabs fase */}
      <div className="flex gap-2">
        {(["pre", "pos"] as const).map((f) => (
          <button
            key={f}
            onClick={() => {
              setFase(f);
              setParPreId(null);
              if (f === "pos") setTipo("rua");
            }}
            className={`px-4 py-2 rounded-lg text-sm font-bold border transition ${
              fase === f
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-input hover:bg-accent"
            }`}
          >
            {f === "pre" ? "PRÉ-OBRA" : "PÓS-OBRA"}
          </button>
        ))}
      </div>

      {/* Capturador */}
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          {fase === "pre" && (
            <div className="flex gap-2">
              {(["rua", "casa"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTipo(t)}
                  className={`px-3 py-1.5 rounded-md text-sm border ${tipo === t ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-accent"}`}
                >
                  {t === "rua" ? "Foto da rua" : "Foto da casa"}
                </button>
              ))}
            </div>
          )}
          {fase === "pre" && tipo === "casa" && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Nº casa</label>
                <input
                  value={numeroCasa}
                  onChange={(e) => setNumeroCasa(e.target.value)}
                  placeholder="Ex: 1390"
                  className="w-24 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Lado</label>
                <div className="flex gap-1">
                  {(["E", "D"] as const).map((l) => (
                    <button
                      key={l}
                      onClick={() => setLado(l)}
                      className={`w-9 h-9 rounded-md border text-sm font-bold ${lado === l ? "bg-primary text-primary-foreground border-primary" : "border-input"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          {fase === "pos" && (
            <div className="space-y-1 flex-1 min-w-[220px]">
              <label className="text-xs font-semibold">Foto pré de referência</label>
              <select
                value={parPreId ?? ""}
                onChange={(e) => setParPreId(e.target.value || null)}
                className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
              >
                <option value="">— escolha qual foto pré você está refazendo —</option>
                {fotosPreRua.map((f, i) => (
                  <option key={f.id} value={f.id}>
                    Rua #{i + 1} · {new Date(f.captured_at).toLocaleString("pt-BR")}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <FotoCaptura
          ruaId={ruaId}
          fase={fase}
          tipo={fase === "pos" ? "rua" : tipo}
          numeroCasa={fase === "pre" && tipo === "casa" ? numeroCasa : null}
          lado={fase === "pre" && tipo === "casa" ? lado : null}
          parPreId={fase === "pos" ? parPreId : null}
          refUrl={refFoto?.url ?? null}
          onSaved={() => {
            refetch();
            qc.invalidateQueries({ queryKey: ["fotos-rua", ruaId] });
          }}
        />
      </div>

      {/* Galeria */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FotoColuna
          titulo="Pré-obra"
          fotos={fotosPre}
          onDelete={handleDelete}
          onStatus={handleStatus}
          onRejeitarPedirConfirm={(id) => setRejeitarId(id)}
          podeAprovar={podeAprovar}
          pendentes={pendentesPre}
          onAprovarTodas={() => setAprovarTodasFase("pre")}
        />
        <FotoColuna
          titulo="Pós-obra"
          fotos={fotosPos}
          onDelete={handleDelete}
          onStatus={handleStatus}
          onRejeitarPedirConfirm={(id) => setRejeitarId(id)}
          podeAprovar={podeAprovar}
          pendentes={pendentesPos}
          onAprovarTodas={() => setAprovarTodasFase("pos")}
        />
      </div>

      {/* Confirm rejeitar */}
      <AlertDialog open={!!rejeitarId} onOpenChange={(o) => !o && setRejeitarId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeitar esta foto?</AlertDialogTitle>
            <AlertDialogDescription>
              O vistoriante precisará refazer a captura. Você pode desfazer depois, se necessário.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={async () => {
                if (rejeitarId) await handleStatus(rejeitarId, "rejeitada");
                setRejeitarId(null);
              }}
            >
              Sim, rejeitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm aprovar todas */}
      <AlertDialog open={!!aprovarTodasFase} onOpenChange={(o) => !o && setAprovarTodasFase(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Aprovar todas as fotos pendentes?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {aprovarTodasFase === "pre"
                ? `${pendentesPre} foto(s) pendente(s) do pré-obra serão aprovadas.`
                : `${pendentesPos} foto(s) pendente(s) do pós-obra serão aprovadas.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => aprovarTodasFase && handleAprovarTodas(aprovarTodasFase)}
            >
              Aprovar todas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FotoColuna({
  titulo,
  fotos,
  onDelete,
  onStatus,
  onRejeitarPedirConfirm,
  podeAprovar,
  pendentes,
  onAprovarTodas,
}: {
  titulo: string;
  fotos: any[];
  onDelete: (id: string) => void;
  onStatus: (id: string, s: "pendente" | "aprovada" | "rejeitada") => void;
  onRejeitarPedirConfirm: (id: string) => void;
  podeAprovar: boolean;
  pendentes: number;
  onAprovarTodas: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 py-2 bg-muted/50 font-bold text-sm uppercase tracking-wider flex justify-between items-center gap-2">
        <span>{titulo} <span className="text-muted-foreground font-normal">{fotos.length}</span></span>
        {podeAprovar && pendentes > 0 && (
          <button
            onClick={onAprovarTodas}
            className="inline-flex items-center gap-1.5 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-2.5 py-1.5 normal-case tracking-normal"
          >
            <CheckCheck size={14} /> Aprovar todas ({pendentes})
          </button>
        )}
      </div>
      {fotos.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma foto.</div>
      ) : (
        <ul className="divide-y">
          {fotos.map((f) => (
            <li key={f.id} className="p-3 space-y-2">
              {f.url && <img src={f.url} alt="" className="w-full rounded-md max-h-80 object-contain bg-black" />}
              <div className="text-xs text-muted-foreground">
                {new Date(f.captured_at).toLocaleString("pt-BR")}
                {f.tipo === "casa" && f.numero_casa && (
                  <> · Casa {f.numero_casa} ({f.lado === "E" ? "esq" : "dir"})</>
                )}
              </div>
              {f.endereco_formatado && <div className="text-xs">{f.endereco_formatado}</div>}

              <div className="flex items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                    f.status === "aprovada"
                      ? "bg-green-600 text-white"
                      : f.status === "rejeitada"
                        ? "bg-red-600 text-white"
                        : "bg-amber-100 text-amber-900"
                  }`}
                >
                  {f.status === "aprovada" ? <CheckCircle2 size={11} /> : f.status === "rejeitada" ? <XCircle size={11} /> : <Clock size={11} />}
                  {f.status}
                </span>
                <button
                  onClick={() => onDelete(f.id)}
                  className="text-muted-foreground hover:text-destructive p-1"
                  title="Excluir foto"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {podeAprovar && f.status === "pendente" && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => onStatus(f.id, "aprovada")}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-3 py-2"
                  >
                    <CheckCircle2 size={16} /> Aprovar
                  </button>
                  <button
                    onClick={() => onRejeitarPedirConfirm(f.id)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-3 py-2"
                  >
                    <XCircle size={16} /> Rejeitar
                  </button>
                </div>
              )}
              {podeAprovar && f.status === "rejeitada" && (
                <button
                  onClick={() => onStatus(f.id, "pendente")}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-3 py-2"
                >
                  <RotateCcw size={15} /> Desfazer rejeição
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
