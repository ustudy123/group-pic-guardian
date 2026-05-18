import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useRef } from "react";
import JSZip from "jszip";
import { Download, Loader2, Trash2, Upload, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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

export const Route = createFileRoute("/painel/$encarregado/$anoMes/$dia")({
  component: DiaPage,
});

type Foto = {
  id: string;
  caption: string | null;
  storage_url: string | null;
  storage_path: string | null;
  data_envio: string | null;
  remetente_nome: string | null;
  mime_type: string | null;
};

type QueryResult = { encarregadoId: string | null; fotos: Foto[] };

function DiaPage() {
  const { encarregado, anoMes, dia } = Route.useParams();
  const [busca, setBusca] = useState("");
  const [remetenteFiltro, setRemetenteFiltro] = useState<string>("todos");
  const [horaInicio, setHoraInicio] = useState<string>("");
  const [horaFim, setHoraFim] = useState<string>("");
  const [ordem, setOrdem] = useState<"asc" | "desc">("asc");
  const [aberta, setAberta] = useState<Foto | null>(null);
  const dataPasta = `${anoMes}-${dia}`;
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [removendoId, setRemovendoId] = useState<string | null>(null);

  const { data: result, isLoading } = useQuery({
    queryKey: ["fotos-dia", encarregado, dataPasta],
    queryFn: async (): Promise<QueryResult> => {
      const { data: enc, error: encErr } = await supabase
        .from("encarregados")
        .select("id")
        .eq("nome", encarregado)
        .maybeSingle();
      if (encErr) throw encErr;
      if (!enc) return { encarregadoId: null, fotos: [] };

      const { data, error } = await supabase
        .from("fotos")
        .select("id, caption, storage_url, storage_path, data_envio, remetente_nome, mime_type")
        .eq("encarregado_id", enc.id)
        .eq("data_pasta", dataPasta)
        .order("data_envio", { ascending: true });
      if (error) throw error;
      const fotos: Foto[] = (data ?? []).map((f) => ({
        id: f.id ?? "",
        caption: f.caption,
        storage_url: f.storage_url,
        storage_path: f.storage_path ?? null,
        data_envio: f.data_envio,
        remetente_nome: f.remetente_nome,
        mime_type: f.mime_type,
      }));
      return { encarregadoId: enc.id, fotos };
    },
    staleTime: 60_000,
  });

  const data = result?.fotos;
  const encarregadoId = result?.encarregadoId ?? null;

  async function enviarFotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!encarregadoId) {
      alert("Encarregado não encontrado.");
      return;
    }
    setEnviando(true);
    try {
      const dataEnvioBase = new Date(`${dataPasta}T12:00:00-03:00`).toISOString();
      for (const file of Array.from(files)) {
        const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
        const nomeArquivo = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const storagePath = `${encarregadoId}/${dataPasta}/${nomeArquivo}`;

        const { error: upErr } = await supabase.storage
          .from("fotos-obras")
          .upload(storagePath, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;

        const { data: signed, error: signErr } = await supabase.storage
          .from("fotos-obras")
          .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10); // 10 anos
        if (signErr) throw signErr;

        const { error: insErr } = await supabase.from("fotos").insert({
          encarregado_id: encarregadoId,
          message_id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          data_envio: dataEnvioBase,
          data_pasta: dataPasta,
          storage_path: storagePath,
          storage_url: signed.signedUrl,
          mime_type: file.type || "image/jpeg",
          tamanho_bytes: file.size,
          remetente_nome: "Upload manual",
          status: "processada",
        });
        if (insErr) {
          // rollback storage
          await supabase.storage.from("fotos-obras").remove([storagePath]);
          throw insErr;
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["fotos-dia", encarregado, dataPasta] });
      await queryClient.invalidateQueries({ queryKey: ["encarregado-fotos", encarregado] });
    } catch (err) {
      console.error(err);
      alert("Erro ao enviar foto(s): " + (err as Error).message);
    } finally {
      setEnviando(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function deletarFoto(foto: Foto) {
    if (!confirm("Excluir esta foto definitivamente?")) return;
    setRemovendoId(foto.id);
    try {
      if (foto.storage_path) {
        await supabase.storage.from("fotos-obras").remove([foto.storage_path]);
      }
      const { error } = await supabase.from("fotos").delete().eq("id", foto.id);
      if (error) throw error;
      setAberta(null);
      await queryClient.invalidateQueries({ queryKey: ["fotos-dia", encarregado, dataPasta] });
      await queryClient.invalidateQueries({ queryKey: ["encarregado-fotos", encarregado] });
    } catch (err) {
      console.error(err);
      alert("Erro ao excluir foto: " + (err as Error).message);
    } finally {
      setRemovendoId(null);
    }
  }


  const remetentes = useMemo(() => {
    const set = new Set<string>();
    data?.forEach((f) => f.remetente_nome && set.add(f.remetente_nome));
    return Array.from(set).sort();
  }, [data]);

  const filtradas = useMemo(() => {
    let arr = data ?? [];
    if (busca.trim()) {
      const q = busca.toLowerCase();
      arr = arr.filter(
        (f) =>
          f.caption?.toLowerCase().includes(q) || f.remetente_nome?.toLowerCase().includes(q)
      );
    }
    if (remetenteFiltro !== "todos") {
      arr = arr.filter((f) => f.remetente_nome === remetenteFiltro);
    }
    if (horaInicio || horaFim) {
      arr = arr.filter((f) => {
        if (!f.data_envio) return false;
        const hora = new Date(f.data_envio).toLocaleTimeString("pt-BR", {
          timeZone: "America/Sao_Paulo",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        if (horaInicio && hora < horaInicio) return false;
        if (horaFim && hora > horaFim) return false;
        return true;
      });
    }
    arr = [...arr].sort((a, b) => {
      const ta = a.data_envio ? new Date(a.data_envio).getTime() : 0;
      const tb = b.data_envio ? new Date(b.data_envio).getTime() : 0;
      return ordem === "asc" ? ta - tb : tb - ta;
    });
    return arr;
  }, [data, busca, remetenteFiltro, horaInicio, horaFim, ordem]);

  const tituloData = useMemo(() => {
    const [y, m, d] = dataPasta.split("-");
    return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }, [dataPasta]);

  const [baixando, setBaixando] = useState(false);
  const [progresso, setProgresso] = useState(0);

  async function baixarZip() {
    if (filtradas.length === 0) return;
    setBaixando(true);
    setProgresso(0);
    try {
      const zip = new JSZip();
      const usados = new Set<string>();
      let i = 0;
      for (const f of filtradas) {
        i++;
        if (!f.storage_url) continue;
        try {
          const res = await fetch(f.storage_url);
          if (!res.ok) continue;
          const blob = await res.blob();
          const ext = (f.mime_type?.split("/")[1] || "jpg").split("+")[0];
          const hora = f.data_envio
            ? new Date(f.data_envio).toLocaleTimeString("pt-BR", {
                timeZone: "America/Sao_Paulo",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }).replace(/:/g, "-")
            : "sem-hora";
          const remet = (f.remetente_nome || "desconhecido").replace(/[^\w\-]+/g, "_");
          let nome = `${String(i).padStart(3, "0")}_${hora}_${remet}.${ext}`;
          while (usados.has(nome)) nome = `${String(i).padStart(3, "0")}_${hora}_${remet}_${Math.random().toString(36).slice(2, 5)}.${ext}`;
          usados.add(nome);
          zip.file(nome, blob);
        } catch (err) {
          console.error("Falha ao baixar foto", f.id, err);
        }
        setProgresso(i);
      }
      const conteudo = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(conteudo);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${encarregado}_${dataPasta}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBaixando(false);
      setProgresso(0);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Link
          to="/painel/$encarregado"
          params={{ encarregado }}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {encarregado}
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold capitalize">{tituloData}</h1>
            <p className="text-muted-foreground text-sm">{filtradas.length} foto(s)</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => enviarFotos(e.target.files)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={enviando || !encarregadoId}
              className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-semibold hover:bg-accent disabled:opacity-50"
            >
              {enviando ? (
                <><Loader2 size={16} className="animate-spin" /> Enviando...</>
              ) : (
                <><Upload size={16} /> Enviar foto</>
              )}
            </button>
            <button
              onClick={baixarZip}
              disabled={baixando || filtradas.length === 0}
              className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {baixando ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {progresso > 0 ? `Baixando ${progresso}/${filtradas.length}...` : "Preparando..."}
                </>
              ) : (
                <>
                  <Download size={16} />
                  Baixar todas (.zip)
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border bg-card">
        <input
          type="text"
          placeholder="Buscar por legenda ou remetente..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="flex-1 min-w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <select
          value={remetenteFiltro}
          onChange={(e) => setRemetenteFiltro(e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-2 text-sm"
        >
          <option value="todos">Todos remetentes</option>
          {remetentes.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Hora:</span>
          <input
            type="time"
            value={horaInicio}
            onChange={(e) => setHoraInicio(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
          <span className="text-muted-foreground">até</span>
          <input
            type="time"
            value={horaFim}
            onChange={(e) => setHoraFim(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
        </div>
        <select
          value={ordem}
          onChange={(e) => setOrdem(e.target.value as "asc" | "desc")}
          className="rounded-md border border-input bg-background px-2 py-2 text-sm"
        >
          <option value="asc">Mais antigas primeiro</option>
          <option value="desc">Mais recentes primeiro</option>
        </select>
        {(busca || remetenteFiltro !== "todos" || horaInicio || horaFim) && (
          <button
            onClick={() => { setBusca(""); setRemetenteFiltro("todos"); setHoraInicio(""); setHoraFim(""); }}
            className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent"
          >
            Limpar
          </button>
        )}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && filtradas.length === 0 && (
        <p className="text-muted-foreground py-8 text-center border rounded-md">
          Nenhuma foto registrada nesse dia
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {filtradas.map((f) => (
          <div
            key={f.id}
            onClick={() => setAberta(f)}
            className="group relative aspect-square overflow-hidden rounded-md border bg-muted cursor-pointer"
          >
            {f.storage_url ? (
              <img
                src={f.storage_url}
                alt={f.caption ?? "Foto"}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                sem preview
              </div>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); deletarFoto(f); }}
              disabled={removendoId === f.id}
              title="Excluir foto"
              className="absolute top-2 right-2 z-10 rounded-md bg-black/60 hover:bg-red-600 text-white p-1.5 opacity-0 group-hover:opacity-100 transition disabled:opacity-50"
            >
              {removendoId === f.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            </button>
            <div className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-xs px-2 py-1.5 opacity-0 group-hover:opacity-100 transition flex items-center justify-between gap-2 pointer-events-none">
              <span className="font-medium">
                {f.data_envio &&
                  new Date(f.data_envio).toLocaleTimeString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
              </span>
              {f.caption && <span className="truncate">{f.caption}</span>}
            </div>
          </div>
        ))}
      </div>

      {aberta && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setAberta(null)}
        >
          <div
            className="max-w-5xl w-full bg-card rounded-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {aberta.storage_url && (
              <img
                src={aberta.storage_url}
                alt={aberta.caption ?? ""}
                className="w-full max-h-[70vh] object-contain bg-black"
              />
            )}
            <div className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-medium">{aberta.remetente_nome ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {aberta.data_envio &&
                      new Date(aberta.data_envio).toLocaleString("pt-BR", {
                        timeZone: "America/Sao_Paulo",
                      })}
                  </p>
                </div>
                <div className="flex gap-2">
                  {aberta.storage_url && (
                    <a
                      href={aberta.storage_url}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
                    >
                      Baixar foto
                    </a>
                  )}
                  <button
                    onClick={() => deletarFoto(aberta)}
                    disabled={removendoId === aberta.id}
                    className="inline-flex items-center gap-1 rounded-md border border-red-300 text-red-600 px-3 py-1.5 text-sm hover:bg-red-50 disabled:opacity-50"
                  >
                    {removendoId === aberta.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Excluir
                  </button>
                  <button
                    onClick={() => setAberta(null)}
                    className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
                  >
                    Fechar
                  </button>
                </div>
              </div>
              {aberta.caption && <p className="text-sm">{aberta.caption}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
