import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { FORM_GRAD, FORM_GRAD_BTN, FORM_BG, FORM_SHADOW } from "@/lib/ui-form";
import {
  ChevronRight,
  Loader2,
  LayoutGrid,
  ImageOff,
  Camera,
  CheckCircle2,
  LogOut,
  HardHat,
} from "lucide-react";

export const Route = createFileRoute("/portal")({
  component: PortalEncarregado,
});

function dataHojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function PortalEncarregado() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [aba, setAba] = useState<"enviar" | "reprovadas">("enviar");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  const { data: encarregado, isLoading: carregandoEnc } = useQuery({
    queryKey: ["portal-encarregado", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase.from("encarregados") as any)
        .select("id, nome, foto_url")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; nome: string; foto_url: string | null } | null;
    },
  });

  // Reprovadas pendentes de correção (para o contador da aba)
  const { data: reprovadas = [] } = useQuery({
    queryKey: ["portal-reprovadas", encarregado?.id],
    enabled: !!encarregado,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data: fotos, error } = await (supabase.from("fotos") as any)
        .select("id, storage_url, caption, data_pasta, data_envio")
        .eq("encarregado_id", encarregado!.id)
        .order("data_envio", { ascending: false })
        .limit(400);
      if (error) throw error;
      const ids = (fotos ?? []).map((f: any) => f.id);
      if (!ids.length) return [];
      const { data: avals } = await (supabase.from("foto_avaliacoes") as any)
        .select("foto_id, status, motivo_id, observacao, correcao_foto_id, avaliado_em")
        .eq("status", "reprovada")
        .in("foto_id", ids);
      const { data: motivos } = await (supabase.from("motivos_reprovacao") as any).select(
        "id, nome",
      );
      const nomeMotivo = new Map((motivos ?? []).map((m: any) => [m.id, m.nome]));
      const porFoto = new Map((fotos ?? []).map((f: any) => [f.id, f]));
      return (avals ?? [])
        .map((a: any) => ({
          ...a,
          foto: porFoto.get(a.foto_id),
          motivo: nomeMotivo.get(a.motivo_id) ?? "Motivo não informado",
        }))
        .filter((a: any) => a.foto)
        .sort((a: any, b: any) => (a.correcao_foto_id ? 1 : 0) - (b.correcao_foto_id ? 1 : 0));
    },
  });
  const pendentesCorrecao = reprovadas.filter((r: any) => !r.correcao_foto_id).length;

  if (loading || carregandoEnc)
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 size={18} className="animate-spin mr-2" /> Carregando...
      </div>
    );

  if (!encarregado)
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundImage: FORM_BG }}>
        <div className="max-w-md text-center bg-card border rounded-3xl p-8" style={{ boxShadow: FORM_SHADOW }}>
          <HardHat className="mx-auto mb-2 text-muted-foreground" size={32} />
          <h1 className="text-xl font-bold">Sem vínculo de encarregado</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Seu login não está vinculado a nenhum encarregado. Fale com a equipe da Macro
            Ambiental para liberar o acesso.
          </p>
          <button
            onClick={() => navigate({ to: "/painel" })}
            className="mt-4 rounded-lg border px-4 py-2 text-sm hover:bg-accent"
          >
            Ir para o painel
          </button>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen pb-10" style={{ backgroundImage: FORM_BG }}>
      {/* Cabeçalho */}
      <div className="px-4 pt-6">
        <div
          className="mx-auto max-w-md relative overflow-hidden rounded-3xl p-5 text-white"
          style={{ backgroundImage: FORM_GRAD, boxShadow: FORM_SHADOW }}
        >
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-white/40 bg-white/20 flex items-center justify-center">
              {encarregado.foto_url ? (
                <img src={encarregado.foto_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <HardHat size={22} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-white/80">Portal do encarregado</div>
              <div className="truncate text-lg font-bold">{encarregado.nome}</div>
            </div>
            <button
              onClick={async () => {
                await signOut();
                navigate({ to: "/login" });
              }}
              className="rounded-lg bg-white/15 p-2 hover:bg-white/25"
              title="Sair"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Abas */}
      <div className="px-4 pt-4">
        <div className="mx-auto max-w-md grid grid-cols-2 rounded-xl border bg-card p-1 text-sm font-medium shadow-sm">
          <button
            onClick={() => setAba("enviar")}
            className={`rounded-lg py-2 ${aba === "enviar" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
          >
            <LayoutGrid size={14} className="inline mr-1.5 -mt-0.5" />
            Enviar
          </button>
          <button
            onClick={() => setAba("reprovadas")}
            className={`relative rounded-lg py-2 ${aba === "reprovadas" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
          >
            <Camera size={14} className="inline mr-1.5 -mt-0.5" />
            Reprovadas
            {pendentesCorrecao > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                {pendentesCorrecao}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="px-4 pt-4">
        <div className="mx-auto max-w-md">
          {aba === "enviar" ? (
            <MenuServicosPortal userId={user!.id} />
          ) : (
            <ListaReprovadas
              encarregado={encarregado}
              reprovadas={reprovadas as any[]}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Menu de serviços do portal: formulários publicados marcados para o menu,
// respeitando restrição por login (sem restrição = liberado a todos).
function MenuServicosPortal({ userId }: { userId: string }) {
  const { data: servicos = [], isLoading } = useQuery({
    queryKey: ["portal-servicos", userId],
    queryFn: async () => {
      const { data: forms, error } = await (supabase.from("formularios") as any)
        .select("id, titulo, descricao, share_slug, menu_icone, menu_ordem")
        .eq("status", "publicado")
        .eq("no_menu", true)
        .order("menu_ordem")
        .order("titulo");
      if (error) throw error;
      const ids = (forms ?? []).map((f: any) => f.id);
      if (!ids.length) return [];
      const { data: acessos } = await (supabase.from("formulario_acessos") as any)
        .select("formulario_id, user_id")
        .in("formulario_id", ids);
      const restritos = new Map<string, Set<string>>();
      for (const a of acessos ?? []) {
        if (!restritos.has(a.formulario_id)) restritos.set(a.formulario_id, new Set());
        restritos.get(a.formulario_id)!.add(a.user_id);
      }
      return (forms ?? []).filter((f: any) => {
        const r = restritos.get(f.id);
        return !r || r.has(userId); // sem restrição = todos; com restrição = só liberados
      });
    },
  });

  if (isLoading)
    return (
      <div className="flex items-center justify-center gap-2 py-14 text-muted-foreground">
        <Loader2 size={18} className="animate-spin" /> Carregando serviços…
      </div>
    );
  if (servicos.length === 0)
    return (
      <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-md">
        Nenhum serviço liberado para você no momento.
      </div>
    );
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Escolha o tipo de serviço para abrir o formulário certo. Você pode enviar quantas vezes
        precisar ao longo do dia.
      </p>
      {servicos.map((s: any) => (
        <a
          key={s.id}
          href={`/f/${s.share_slug}`}
          className="group flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl text-white"
            style={{ backgroundImage: FORM_GRAD_BTN }}
          >
            {s.menu_icone || "📋"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{s.titulo}</div>
            {s.descricao && (
              <div className="text-xs text-muted-foreground line-clamp-2">{s.descricao}</div>
            )}
          </div>
          <ChevronRight size={18} className="shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
        </a>
      ))}
    </div>
  );
}

// Fotos reprovadas pela qualidade, com motivo e correção (nova foto substitui).
function ListaReprovadas({
  encarregado,
  reprovadas,
}: {
  encarregado: { id: string; nome: string };
  reprovadas: any[];
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [corrigindo, setCorrigindo] = useState<any | null>(null);

  const corrigir = useMutation({
    mutationFn: async ({ avaliacao, file }: { avaliacao: any; file: File }) => {
      const dataPasta = dataHojeSP();
      const uid = `correcao-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const path = `${encarregado.id}/${dataPasta}/${uid}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("fotos-obras").upload(path, file);
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage
        .from("fotos-obras")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);

      const { data: nova, error: fotoErr } = await (supabase.from("fotos") as any)
        .insert({
          encarregado_id: encarregado.id,
          message_id: uid,
          storage_path: path,
          storage_url: signed?.signedUrl ?? null,
          data_envio: new Date().toISOString(),
          data_pasta: dataPasta,
          caption: `Correção — ${avaliacao.motivo}`,
          mime_type: file.type,
          tamanho_bytes: file.size,
          remetente_nome: encarregado.nome,
          status: "formulario",
        })
        .select("id")
        .single();
      if (fotoErr) throw fotoErr;

      const { error: avErr } = await (supabase.from("foto_avaliacoes") as any)
        .update({ correcao_foto_id: nova.id, corrigida_em: new Date().toISOString() })
        .eq("foto_id", avaliacao.foto_id);
      if (avErr) throw avErr;
    },
    onSuccess: () => {
      toast.success("Foto corrigida enviada! A qualidade vai reavaliar.");
      setCorrigindo(null);
      qc.invalidateQueries({ queryKey: ["portal-reprovadas"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (reprovadas.length === 0)
    return (
      <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-md">
        <CheckCircle2 className="mx-auto mb-2 text-emerald-500" />
        Nenhuma foto reprovada. Bom trabalho!
      </div>
    );

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Estas fotos foram reprovadas pela qualidade. Toque em <b>Corrigir</b> para enviar uma nova
        foto no lugar.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && corrigindo) corrigir.mutate({ avaliacao: corrigindo, file: f });
          e.target.value = "";
        }}
      />
      {reprovadas.map((r) => (
        <div key={r.foto_id} className="overflow-hidden rounded-2xl border bg-card shadow-md">
          <div className="flex gap-3 p-3">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
              {r.foto?.storage_url ? (
                <img src={r.foto.storage_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <ImageOff size={18} />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-semibold text-red-600">{r.motivo}</div>
              {r.observacao && <div className="text-xs text-muted-foreground">{r.observacao}</div>}
              <div className="mt-1 text-xs text-muted-foreground">
                Foto de {r.foto?.data_pasta}
                {r.foto?.caption ? ` · ${r.foto.caption}` : ""}
              </div>
              {r.correcao_foto_id ? (
                <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle2 size={11} /> Correção enviada
                </span>
              ) : (
                <button
                  onClick={() => {
                    setCorrigindo(r);
                    fileRef.current?.click();
                  }}
                  disabled={corrigir.isPending}
                  className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {corrigir.isPending && corrigindo?.foto_id === r.foto_id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Camera size={12} />
                  )}
                  Corrigir (tirar nova foto)
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
