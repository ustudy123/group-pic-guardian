import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type BotStatus = {
  connection_status: "idle" | "starting" | "qr_ready" | "connected" | "disconnected" | "error";
  qr_text: string | null;
  last_error: string | null;
  phone_jid: string | null;
  last_event_at: string;
  updated_at: string;
};

const statusCopy: Record<BotStatus["connection_status"], { label: string; tone: string; hint: string }> = {
  idle: {
    label: "Aguardando bot",
    tone: "bg-muted text-muted-foreground",
    hint: "O painel ainda não recebeu nenhum status novo do bot.",
  },
  starting: {
    label: "Iniciando",
    tone: "bg-secondary text-secondary-foreground",
    hint: "O bot está subindo e tentando abrir a sessão do WhatsApp.",
  },
  qr_ready: {
    label: "QR pronto",
    tone: "bg-primary/10 text-foreground",
    hint: "Escaneie este QR com o número do bot em Aparelhos conectados.",
  },
  connected: {
    label: "Conectado",
    tone: "bg-primary text-primary-foreground",
    hint: "O bot está conectado e pronto para receber fotos dos grupos.",
  },
  disconnected: {
    label: "Desconectado",
    tone: "bg-muted text-foreground",
    hint: "A conexão caiu; o bot está tentando reconectar automaticamente.",
  },
  error: {
    label: "Erro",
    tone: "bg-destructive/10 text-destructive",
    hint: "O bot encontrou um erro e pode precisar reiniciar a sessão.",
  },
};

export function WhatsAppBotStatusCard() {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["whatsapp-bot-status"],
    queryFn: async (): Promise<BotStatus | null> => {
      const { data, error } = await supabase
        .from("whatsapp_bot_status")
        .select("connection_status, qr_text, last_error, phone_jid, last_event_at, updated_at")
        .eq("id", "main")
        .maybeSingle();

      if (error) throw error;
      return data as BotStatus | null;
    },
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    let active = true;

    if (!data?.qr_text) {
      setQrDataUrl(null);
      return;
    }

    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(data.qr_text as string, {
          margin: 1,
          width: 320,
        })
      )
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl(null);
      });

    return () => {
      active = false;
    };
  }, [data?.qr_text]);

  const status = data?.connection_status ?? "idle";
  const copy = statusCopy[status];
  const updatedAt = useMemo(() => {
    if (!data?.updated_at) return null;
    return new Date(data.updated_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  }, [data?.updated_at]);

  return (
    <section className="border rounded-lg bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Conexão do WhatsApp</h2>
          <p className="text-sm text-muted-foreground">{copy.hint}</p>
        </div>
        <span className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-medium ${copy.tone}`}>
          {isLoading ? "Carregando..." : copy.label}
        </span>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="space-y-4 text-sm">
          <div className="rounded-lg border bg-background p-4">
            <p className="font-medium">Como reconectar</p>
            <ol className="mt-2 space-y-2 text-muted-foreground">
              <li>1. Abra o WhatsApp do número do bot.</li>
              <li>2. Entre em <strong className="text-foreground">Aparelhos conectados</strong>.</li>
              <li>3. Toque em <strong className="text-foreground">Conectar um aparelho</strong>.</li>
              <li>4. Escaneie o QR que aparece aqui no painel quando o bot entrar em pareamento.</li>
            </ol>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-background p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Última atualização</p>
              <p className="mt-1 font-medium">{updatedAt ?? "Aguardando status"}</p>
            </div>
            <div className="rounded-lg border bg-background p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Bot conectado como</p>
              <p className="mt-1 font-medium break-all">{data?.phone_jid ?? "Ainda não conectado"}</p>
            </div>
          </div>

          {data?.last_error && status !== "connected" && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-xs uppercase tracking-wide text-destructive">Último erro</p>
              <p className="mt-1 text-sm text-foreground break-words">{data.last_error}</p>
            </div>
          )}
        </div>

        <div className="rounded-lg border bg-background p-4">
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md border bg-card">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR code para conectar o bot do WhatsApp" className="h-full w-full object-contain" />
            ) : (
              <div className="max-w-[220px] text-center text-sm text-muted-foreground">
                {status === "connected"
                  ? "O bot já está conectado. Quando a sessão expirar, o novo QR aparecerá aqui."
                  : "Assim que o bot entrar em modo de pareamento, o QR aparecerá aqui automaticamente."}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}