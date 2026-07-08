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
  Download,
  Bell,
  X,
} from "lucide-react";

export const Route = createFileRoute("/portal")({
  component: PortalEncarregado,
});

function dataHojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

// ---------- PWA (instalação + notificações) — somente no portal ----------

// Chave PÚBLICA do push (a privada fica no servidor/banco)
const VAPID_PUBLIC_KEY =
  "BMeQNnVd1aFrpllOvsqDPHdZ9jhHfbdTWKQQ1RilM4UH8AIQiNpckl4f3k1YOd24T8hr0Ra6jdduTDhISWIDEbo";

function b64ToUint8(base64url: string): Uint8Array {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const b64 = (base64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const ehStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true);

const ehIOS = () =>
  typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

/** Registra manifest + service worker apenas quando o portal é aberto. */
function usePwaPortal() {
  const [swReg, setSwReg] = useState<ServiceWorkerRegistration | null>(null);
  useEffect(() => {
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement("link");
      link.rel = "manifest";
      link.href = "/manifest.webmanifest";
      document.head.appendChild(link);
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => setSwReg(reg))
        .catch((e) => console.warn("[portal] sw register falhou:", e));
    }
  }, []);
  return swReg;
}

/** Banner "instale o aplicativo" (Android/desktop via prompt; iOS via instruções). */
function BannerInstalarApp() {
  const [promptEvt, setPromptEvt] = useState<any>(null);
  const [dispensado, setDispensado] = useState(
    () => typeof localStorage !== "undefined" && localStorage.getItem("portal-pwa-dispensado") === "1",
  );
  const [instalado, setInstalado] = useState(ehStandalone());

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvt(e);
    };
    const onInstalled = () => setInstalado(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dispensar = () => {
    setDispensado(true);
    try {
      localStorage.setItem("portal-pwa-dispensado", "1");
    } catch {}
  };

  if (instalado || dispensado) return null;
  const ios = ehIOS();
  if (!promptEvt && !ios) return null;

  return (
    <div className="relative rounded-2xl border-2 border-violet-300 bg-violet-50 p-4 shadow-md">
      <button
        onClick={dispensar}
        className="absolute right-2 top-2 text-violet-400 hover:text-violet-700"
        title="Agora não"
      >
        <X size={15} />
      </button>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white">
          <Download size={18} />
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <b>Instale o aplicativo do portal</b>
          {ios && !promptEvt ? (
            <p className="mt-0.5 text-xs text-violet-900/80">
              No iPhone: toque em <b>Compartilhar</b> (□↑) e depois em{" "}
              <b>"Adicionar à Tela de Início"</b>. O portal vira um app com ícone próprio.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-violet-900/80">
              Fica com ícone na tela do celular, abre mais rápido e recebe os avisos.
            </p>
          )}
          {promptEvt && (
            <button
              onClick={async () => {
                promptEvt.prompt();
                const { outcome } = await promptEvt.userChoice;
                if (outcome === "accepted") setInstalado(true);
                setPromptEvt(null);
              }}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
            >
              <Download size={13} /> Instalar agora
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Card de ativação das notificações push (avisos de foto reprovada etc.). */
function CardNotificacoes({
  swReg,
  userId,
}: {
  swReg: ServiceWorkerRegistration | null;
  userId: string;
}) {
  const suportado =
    typeof window !== "undefined" && "Notification" in window && "PushManager" in window;
  const [permissao, setPermissao] = useState(() => (suportado ? Notification.permission : "default"));
  const [assinado, setAssinado] = useState<boolean | null>(null);
  const [ativando, setAtivando] = useState(false);

  useEffect(() => {
    if (!swReg || !suportado) return;
    swReg.pushManager.getSubscription().then((s) => setAssinado(!!s));
  }, [swReg, suportado]);

  const ativar = async () => {
    if (!swReg) {
      toast.error("Aguarde o portal terminar de carregar e tente de novo.");
      return;
    }
    setAtivando(true);
    try {
      const perm = await Notification.requestPermission();
      setPermissao(perm);
      if (perm !== "granted") {
        toast.error("Permissão de notificação não concedida.");
        return;
      }
      const sub =
        (await swReg.pushManager.getSubscription()) ??
        (await swReg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64ToUint8(VAPID_PUBLIC_KEY) as unknown as BufferSource,
        }));
      const raw = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) {
        throw new Error("Inscrição de push incompleta.");
      }
      const { error } = await (supabase.from("push_subscriptions") as any).upsert(
        {
          user_id: userId,
          endpoint: raw.endpoint,
          p256dh: raw.keys.p256dh,
          auth: raw.keys.auth,
          user_agent: navigator.userAgent.slice(0, 250),
        },
        { onConflict: "endpoint" },
      );
      if (error) throw error;
      setAssinado(true);
      toast.success("Avisos ativados neste aparelho!");
    } catch (e: any) {
      toast.error(e.message ?? "Não foi possível ativar os avisos.");
    } finally {
      setAtivando(false);
    }
  };

  if (!suportado) {
    // iOS só suporta push com o app instalado na tela de início (iOS 16.4+)
    if (ehIOS() && !ehStandalone()) return null;
    return null;
  }
  if (assinado && permissao === "granted")
    return (
      <div className="flex items-center gap-2 rounded-xl border bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
        <Bell size={13} /> Avisos ativados — você será notificado quando uma foto for reprovada.
      </div>
    );
  if (permissao === "denied")
    return (
      <div className="rounded-xl border bg-amber-50 px-3 py-2 text-xs text-amber-800">
        As notificações estão bloqueadas neste navegador. Libere em configurações do site para
        receber os avisos.
      </div>
    );
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-3.5 shadow-md">
      <div className="flex items-center gap-2.5 text-sm">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
          <Bell size={16} />
        </div>
        <div>
          <b>Ativar avisos</b>
          <p className="text-xs text-amber-900/80">
            Receba uma notificação quando uma foto sua for reprovada.
          </p>
        </div>
      </div>
      <button
        onClick={ativar}
        disabled={ativando}
        className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
      >
        {ativando ? "Ativando..." : "Ativar"}
      </button>
    </div>
  );
}

function PortalEncarregado() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [aba, setAba] = useState<"enviar" | "reprovadas">("enviar");
  const swReg = usePwaPortal();

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

      {/* Instalação do app + avisos (PWA) */}
      <div className="px-4 pt-3">
        <div className="mx-auto max-w-md space-y-2">
          <BannerInstalarApp />
          <CardNotificacoes swReg={swReg} userId={user!.id} />
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
