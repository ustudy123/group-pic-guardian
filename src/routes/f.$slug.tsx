import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, Paperclip, Loader2, Image as ImageIcon, X } from "lucide-react";
import { FORM_GRAD, FORM_GRAD_BTN, FORM_BG, FORM_SHADOW } from "@/lib/ui-form";

export const Route = createFileRoute("/f/$slug")({
  component: FormPublico,
});

// Avalia se um campo deve ser exibido, dada a condição e as respostas atuais.
// Recursivo: se a pergunta de origem também estiver oculta, este campo fica oculto.
function campoVisivel(
  c: any,
  valores: Record<string, any>,
  byId: Record<string, any>,
  seen: Set<string> = new Set(),
): boolean {
  const cond = c?.condicao;
  if (!cond || !cond.campo_id) return true;
  if (seen.has(c.id)) return true; // proteção contra ciclo
  seen.add(c.id);
  const origem = byId[cond.campo_id];
  if (origem && !campoVisivel(origem, valores, byId, seen)) return false;
  const resp = valores[cond.campo_id];
  if (resp === undefined || resp === null || resp === "") return false; // origem ainda não respondida
  return cond.operador === "diferente" ? resp !== cond.valor : resp === cond.valor;
}

function FormPublico() {
  const { slug } = Route.useParams();
  const [valores, setValores] = useState<Record<string, any>>({});
  const [arquivos, setArquivos] = useState<Record<string, File[]>>({});
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [temRascunho, setTemRascunho] = useState(false);
  const RASCUNHO_KEY = `rascunho:formulario:${slug}`;

  const { data, isLoading, error } = useQuery({
    queryKey: ["form-publico", slug],
    queryFn: async () => {
      // Publicado basta; se não for público, exige usuário logado (portal do
      // encarregado). A RLS já limita o anônimo a publicado+público.
      const { data: form, error: e1 } = await supabase
        .from("formularios")
        .select("*")
        .eq("share_slug", slug)
        .eq("status", "publicado")
        .maybeSingle();
      if (e1) throw e1;
      if (!form) throw new Error("Formulário não encontrado ou não está disponível.");
      if (!form.publico) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Este formulário é restrito — faça login para preencher.");
      }
      const { data: campos } = await supabase
        .from("formulario_campos")
        .select("*")
        .eq("formulario_id", form.id)
        .order("ordem");
      return { form, campos: campos ?? [] };
    },
  });

  const byId = useMemo(() => {
    const m: Record<string, any> = {};
    for (const c of ((data?.campos ?? []) as any[])) m[c.id] = c;
    return m;
  }, [data]);
  const visivel = (c: any) => campoVisivel(c, valores, byId);

  const enviar = useMutation({
    mutationFn: async () => {
      if (!data) return;
      // Validação obrigatórios (ignora campos ocultos pela condicional)
      for (const c of data.campos) {
        if (!visivel(c)) continue;
        if (c.obrigatorio && c.tipo !== "secao") {
          if (c.tipo === "arquivo" || c.tipo === "foto") {
            if (!arquivos[c.id]?.length) throw new Error(`Campo "${c.rotulo}" é obrigatório.`);
          } else {
            const v = valores[c.id];
            if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length))
              throw new Error(`Campo "${c.rotulo}" é obrigatório.`);
          }
        }
      }

      // Upload arquivos
      const arquivosMeta: any[] = [];
      const { data: { user } } = await supabase.auth.getUser();

      // Encarregado logado? Fotos vão para a PASTA dele ({encarregado}/{data})
      // e entram no acervo (tabela fotos) tagueadas pelo formulário — assim
      // aparecem nas pastas do painel e na Visão Qualidade em tempo real.
      // status='formulario' não dispara a análise de IA.
      let encarregado: { id: string; nome: string } | null = null;
      if (user) {
        const { data: enc } = await (supabase.from("encarregados") as any)
          .select("id, nome")
          .eq("user_id", user.id)
          .maybeSingle();
        encarregado = enc ?? null;
      }
      const dataPasta = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
      }).format(new Date());

      for (const [campoId, files] of Object.entries(arquivos)) {
        if (!visivel(byId[campoId])) continue; // não envia arquivo de campo oculto
        const rotuloCampo = byId[campoId]?.rotulo ?? "";
        for (const f of files) {
          if (!user) {
            throw new Error(
              `Anexos só são suportados para usuários autenticados nesta versão. Remova o arquivo do campo.`,
            );
          }
          const uid = `form-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const ehFotoDeEncarregado = !!encarregado && f.type.startsWith("image/");
          const path = ehFotoDeEncarregado
            ? `${encarregado!.id}/${dataPasta}/${uid}-${f.name}`
            : `formularios/${data.form.id}/${uid}-${f.name}`;
          const { error } = await supabase.storage.from("fotos-obras").upload(path, f);
          if (error) throw error;
          arquivosMeta.push({
            campo_id: campoId,
            path,
            nome: f.name,
            tipo: f.type,
            tamanho: f.size,
          });

          if (ehFotoDeEncarregado) {
            const { data: signed } = await supabase.storage
              .from("fotos-obras")
              .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
            const { error: fotoErr } = await (supabase.from("fotos") as any).insert({
              encarregado_id: encarregado!.id,
              message_id: uid,
              storage_path: path,
              storage_url: signed?.signedUrl ?? null,
              data_envio: new Date().toISOString(),
              data_pasta: dataPasta,
              caption: `${data.form.titulo}${rotuloCampo ? ` — ${rotuloCampo}` : ""}`,
              mime_type: f.type,
              tamanho_bytes: f.size,
              remetente_nome: encarregado!.nome,
              status: "formulario",
              formulario_id: data.form.id,
            });
            if (fotoErr) console.error("[formulario] erro ao registrar foto no acervo:", fotoErr);
          }
        }
      }

      // Salva apenas respostas de campos visíveis (descarta respostas de campos ocultos)
      const dadosVisiveis: Record<string, any> = {};
      for (const c of data.campos) {
        if (c.tipo === "secao") continue;
        if (visivel(c) && valores[c.id] !== undefined) dadosVisiveis[c.id] = valores[c.id];
      }

      const { error } = await supabase.from("formulario_respostas").insert({
        formulario_id: data.form.id,
        respondente_id: user?.id ?? null,
        respondente_nome: nome || null,
        respondente_email: email || user?.email || null,
        dados: dadosVisiveis,
        arquivos: arquivosMeta,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      try {
        localStorage.removeItem(RASCUNHO_KEY);
      } catch {}
      setEnviado(true);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Rascunho salvo no próprio dispositivo (sem depender de login).
  // Guarda texto/seleções; as fotos não entram no rascunho.
  useEffect(() => {
    try {
      if (localStorage.getItem(RASCUNHO_KEY)) setTemRascunho(true);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [RASCUNHO_KEY]);

  const salvarRascunho = () => {
    try {
      localStorage.setItem(RASCUNHO_KEY, JSON.stringify({ nome, email, valores }));
      setTemRascunho(false);
      toast.success("Rascunho salvo neste dispositivo.");
    } catch {
      toast.error("Não foi possível salvar o rascunho.");
    }
  };
  const restaurarRascunho = () => {
    try {
      const raw = localStorage.getItem(RASCUNHO_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      setNome(d.nome ?? "");
      setEmail(d.email ?? "");
      setValores(d.valores ?? {});
      setTemRascunho(false);
      toast.success("Rascunho restaurado. As fotos precisam ser anexadas novamente.");
    } catch {
      toast.error("Não foi possível restaurar o rascunho.");
    }
  };
  const descartarRascunho = () => {
    try {
      localStorage.removeItem(RASCUNHO_KEY);
    } catch {}
    setTemRascunho(false);
  };

  if (isLoading)
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  if (error || !data)
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold">Formulário indisponível</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {(error as any)?.message ?? "Verifique o link."}
          </p>
        </div>
      </div>
    );

  if (enviado)
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundImage: FORM_BG }}>
        <div className="max-w-md text-center bg-card border rounded-3xl p-8" style={{ boxShadow: FORM_SHADOW }}>
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl text-white"
            style={{ backgroundImage: FORM_GRAD, boxShadow: FORM_SHADOW }}
          >
            <CheckCircle2 size={32} />
          </div>
          <h1 className="text-2xl font-bold mt-4">Resposta enviada!</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Obrigado por preencher o formulário.
          </p>
          {data.form.permite_multiplas && (
            <button
              onClick={() => {
                setValores({});
                setArquivos({});
                setNome("");
                setEmail("");
                setEnviado(false);
              }}
              className="mt-5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Enviar outra resposta
            </button>
          )}
        </div>
      </div>
    );

  return (
    <div className="min-h-screen py-8 px-4" style={{ backgroundImage: FORM_BG }}>
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Cabeçalho herói com gradiente */}
        <div
          className="relative overflow-hidden rounded-3xl p-7 text-white"
          style={{ backgroundImage: FORM_GRAD, boxShadow: FORM_SHADOW }}
        >
          <div
            className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full"
            style={{ background: "rgba(255,255,255,0.12)" }}
          />
          <h1 className="relative text-3xl font-bold drop-shadow-sm">{data.form.titulo}</h1>
          {data.form.descricao && (
            <p className="relative text-sm text-white/85 mt-2">{data.form.descricao}</p>
          )}
        </div>

        {temRascunho && (
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3 text-sm"
            style={{ background: "rgba(124,58,237,0.06)", borderColor: "rgba(124,58,237,0.30)" }}
          >
            <span className="text-muted-foreground">
              Você tem um rascunho salvo deste formulário neste dispositivo.
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={descartarRascunho}
                className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent"
              >
                Descartar
              </button>
              <button
                type="button"
                onClick={restaurarRascunho}
                style={{ backgroundImage: FORM_GRAD_BTN }}
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-white"
              >
                Restaurar
              </button>
            </div>
          </div>
        )}

        <div className="bg-card border rounded-2xl p-6 shadow-lg space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-muted-foreground">Seu nome (opcional)</span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 outline-none focus:ring-2"
                style={{ ["--tw-ring-color" as any]: "#8b5cf6" }}
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Seu email (opcional)</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 outline-none focus:ring-2"
                style={{ ["--tw-ring-color" as any]: "#8b5cf6" }}
              />
            </label>
          </div>
        </div>

        {data.campos.filter((c: any) => visivel(c)).map((c: any) => (
          <CampoInput
            key={c.id}
            c={c}
            valor={valores[c.id]}
            onChange={(v) => setValores({ ...valores, [c.id]: v })}
            arquivos={arquivos[c.id] ?? []}
            onArquivos={(fs) => setArquivos({ ...arquivos, [c.id]: fs })}
          />
        ))}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={salvarRascunho}
            disabled={enviar.isPending}
            title="Salva o preenchimento neste dispositivo para continuar depois (não inclui fotos)"
            className="rounded-xl border px-4 py-3 text-sm font-semibold hover:bg-accent disabled:opacity-50"
          >
            Salvar rascunho
          </button>
          <button
            onClick={() => enviar.mutate()}
            disabled={enviar.isPending}
            style={{ backgroundImage: FORM_GRAD_BTN, boxShadow: FORM_SHADOW }}
            className="flex-1 rounded-xl px-4 py-3 font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 inline-flex items-center justify-center gap-2"
          >
            {enviar.isPending && <Loader2 size={16} className="animate-spin" />}
            Enviar resposta
          </button>
        </div>
      </div>
    </div>
  );
}

function CampoInput({
  c,
  valor,
  onChange,
  arquivos,
  onArquivos,
}: {
  c: any;
  valor: any;
  onChange: (v: any) => void;
  arquivos: File[];
  onArquivos: (fs: File[]) => void;
}) {
  if (c.tipo === "secao") {
    return (
      <div className="pt-2 pl-3" style={{ borderLeft: "3px solid #8b5cf6" }}>
        <h2 className="text-xl font-bold">{c.rotulo}</h2>
        {c.descricao && <p className="text-sm text-muted-foreground">{c.descricao}</p>}
      </div>
    );
  }
  const baseInput =
    "mt-1 w-full rounded-md border bg-background px-3 py-2 outline-none focus:ring-2 [--tw-ring-color:#8b5cf6]";
  return (
    <div className="bg-card border rounded-2xl p-5 shadow-lg transition-shadow hover:shadow-xl">
      <label className="block text-sm font-semibold">
        {c.rotulo}
        {c.obrigatorio && <span className="text-destructive"> *</span>}
      </label>
      {c.descricao && <p className="text-xs text-muted-foreground mt-0.5">{c.descricao}</p>}
      {c.tipo === "texto_curto" && (
        <input
          value={valor ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={c.placeholder ?? ""}
          className={baseInput}
        />
      )}
      {c.tipo === "texto_longo" && (
        <textarea
          value={valor ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={c.placeholder ?? ""}
          rows={4}
          className={baseInput}
        />
      )}
      {c.tipo === "numero" && (
        <input
          type="number"
          value={valor ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={baseInput}
        />
      )}
      {c.tipo === "data" && (
        <input
          type="date"
          value={valor ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={baseInput}
        />
      )}
      {c.tipo === "hora" && (
        <input
          type="time"
          value={valor ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={baseInput}
        />
      )}
      {c.tipo === "datahora" && (
        <input
          type="datetime-local"
          value={valor ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={baseInput}
        />
      )}
      {c.tipo === "dropdown" && (
        <select
          value={valor ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={baseInput}
        >
          <option value="">{c.placeholder ?? "Selecione..."}</option>
          {(c.opcoes as string[]).map((op, i) => (
            <option key={i} value={op}>
              {op}
            </option>
          ))}
        </select>
      )}
      {c.tipo === "escolha_unica" && (
        <div className="mt-2 space-y-1.5">
          {(c.opcoes as string[]).map((op, i) => (
            <label key={i} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={valor === op}
                onChange={() => onChange(op)}
              />
              {op}
            </label>
          ))}
        </div>
      )}
      {c.tipo === "escolha_multipla" && (
        <div className="mt-2 space-y-1.5">
          {(c.opcoes as string[]).map((op, i) => {
            const arr: string[] = Array.isArray(valor) ? valor : [];
            return (
              <label key={i} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={arr.includes(op)}
                  onChange={(e) => {
                    if (e.target.checked) onChange([...arr, op]);
                    else onChange(arr.filter((x) => x !== op));
                  }}
                />
                {op}
              </label>
            );
          })}
        </div>
      )}
      {(c.tipo === "arquivo" || c.tipo === "foto") && (
        <FileField
          tipo={c.tipo}
          multiplo={(c.config as any)?.multiplo !== false}
          arquivos={arquivos}
          onArquivos={onArquivos}
        />
      )}
    </div>
  );
}

function FileField({
  tipo,
  multiplo,
  arquivos,
  onArquivos,
}: {
  tipo: string;
  multiplo: boolean;
  arquivos: File[];
  onArquivos: (fs: File[]) => void;
}) {
  const ehFoto = tipo === "foto";

  // Prévia em miniatura para imagens (com limpeza dos object URLs)
  const previews = useMemo(
    () => arquivos.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)),
    [arquivos],
  );
  useEffect(
    () => () => previews.forEach((u) => u && URL.revokeObjectURL(u)),
    [previews],
  );

  const chave = (f: File) => `${f.name}-${f.size}-${f.lastModified}`;
  const adicionar = (lista: FileList | null) => {
    const novos = Array.from(lista ?? []);
    if (!novos.length) return;
    if (!multiplo) {
      onArquivos(novos.slice(0, 1));
      return;
    }
    const existentes = new Set(arquivos.map(chave));
    onArquivos([...arquivos, ...novos.filter((f) => !existentes.has(chave(f)))]);
  };
  const remover = (i: number) => onArquivos(arquivos.filter((_, k) => k !== i));

  const rotulo = arquivos.length
    ? multiplo
      ? ehFoto
        ? "Adicionar mais fotos"
        : "Adicionar mais arquivos"
      : "Trocar"
    : ehFoto
      ? multiplo
        ? "Selecionar fotos (várias de uma vez)"
        : "Selecionar foto"
      : multiplo
        ? "Selecionar arquivos"
        : "Selecionar arquivo";

  return (
    <div className="mt-2 space-y-2">
      <label className="inline-flex items-center gap-2 rounded-lg border-2 border-dashed bg-background px-3 py-2.5 text-sm font-medium cursor-pointer hover:bg-accent">
        {ehFoto ? <ImageIcon size={15} /> : <Paperclip size={14} />}
        {rotulo}
        <input
          type="file"
          accept={ehFoto ? "image/*" : undefined}
          multiple={multiplo}
          onChange={(e) => {
            adicionar(e.target.files);
            e.currentTarget.value = ""; // permite reescolher o mesmo arquivo
          }}
          className="hidden"
        />
      </label>

      {arquivos.length > 0 && ehFoto && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {arquivos.map((f, i) => (
            <div key={chave(f)} className="group relative aspect-square overflow-hidden rounded-lg border">
              {previews[i] ? (
                <img src={previews[i]!} alt={f.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center p-1 text-center text-[10px] text-muted-foreground">
                  {f.name}
                </div>
              )}
              <button
                type="button"
                onClick={() => remover(i)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white transition hover:bg-black/80"
                title="Remover"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {arquivos.length > 0 && !ehFoto && (
        <ul className="space-y-1">
          {arquivos.map((f, i) => (
            <li
              key={chave(f)}
              className="flex items-center justify-between rounded-md border bg-background px-2 py-1 text-xs"
            >
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => remover(i)}
                className="ml-2 shrink-0 text-muted-foreground hover:text-destructive"
                title="Remover"
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {arquivos.length > 1 && (
        <p className="text-xs text-muted-foreground">{arquivos.length} arquivos selecionados</p>
      )}
    </div>
  );
}
