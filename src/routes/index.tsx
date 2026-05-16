import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, Users, FolderTree, ShieldCheck, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Macro Ambiental — Painel de Fotos de Obras" },
      {
        name: "description",
        content:
          "Painel automático de fotos enviadas pelos encarregados nos grupos de WhatsApp, organizadas por encarregado, mês e dia.",
      },
    ],
  }),
  component: Home,
});

const WA_PRIMARY = "#25D366";
const WA_DEEP = "#128C7E";
const WA_DARK = "#075E54";
const WA_TINT = "#DCF8C6";

function Home() {
  return (
    <div
      className="min-h-screen relative overflow-hidden flex items-center justify-center px-6 py-16"
      style={{
        background:
          "radial-gradient(1200px 600px at 85% -10%, rgba(37,211,102,0.18), transparent 60%), radial-gradient(900px 500px at -10% 110%, rgba(7,94,84,0.18), transparent 60%), linear-gradient(180deg, #f7faf7 0%, #eef6f1 100%)",
      }}
    >
      {/* Subtle WhatsApp-style bubble pattern */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 20% 30%, ${WA_DARK} 2px, transparent 2.5px), radial-gradient(circle at 70% 70%, ${WA_DARK} 3px, transparent 3.5px), radial-gradient(circle at 90% 20%, ${WA_DARK} 1.5px, transparent 2px)`,
          backgroundSize: "80px 80px",
        }}
      />

      <div className="relative max-w-3xl w-full">
        <div
          className="rounded-3xl bg-white/80 backdrop-blur-xl border overflow-hidden"
          style={{
            borderColor: "rgba(18,140,126,0.15)",
            boxShadow:
              "0 30px 80px -30px rgba(7,94,84,0.35), 0 8px 24px -12px rgba(18,140,126,0.25)",
          }}
        >
          {/* Top WhatsApp-green banner */}
          <div
            className="relative h-28"
            style={{
              background: `linear-gradient(135deg, ${WA_PRIMARY} 0%, ${WA_DEEP} 60%, ${WA_DARK} 100%)`,
            }}
          >
            <div
              className="absolute inset-0 opacity-25"
              style={{
                backgroundImage: `radial-gradient(circle at 15% 40%, #fff 2px, transparent 2.5px), radial-gradient(circle at 65% 70%, #fff 3px, transparent 3.5px), radial-gradient(circle at 90% 25%, #fff 1.5px, transparent 2px)`,
                backgroundSize: "70px 70px",
              }}
            />
            {/* Online badge */}
            <div className="absolute top-4 left-5 flex items-center gap-1.5 text-[10px] font-semibold text-white/95 uppercase tracking-[0.18em]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inset-0 rounded-full bg-white animate-ping opacity-70" />
                <span className="relative rounded-full h-2 w-2 bg-white" />
              </span>
              Sistema online
            </div>
            {/* Floating logo */}
            <div className="absolute -bottom-9 left-1/2 -translate-x-1/2">
              <div
                className="w-[72px] h-[72px] rounded-2xl flex items-center justify-center ring-4 ring-white shadow-xl"
                style={{
                  background: `linear-gradient(135deg, ${WA_PRIMARY}, ${WA_DEEP})`,
                }}
              >
                <MessageCircle className="text-white drop-shadow" size={34} strokeWidth={2.4} />
              </div>
            </div>
          </div>

          <div className="px-8 sm:px-12 pt-14 pb-10 text-center space-y-6">
            <div className="space-y-3">
              <div
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider"
                style={{ background: WA_TINT, color: WA_DARK }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: WA_DEEP }} />
                Macro Ambiental
              </div>
              <h1
                className="text-4xl sm:text-5xl font-black tracking-tight"
                style={{ color: WA_DARK }}
              >
                Painel de Fotos de Obras
              </h1>
              <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
                Fotos enviadas pelos encarregados nos grupos de WhatsApp são baixadas
                automaticamente e organizadas por encarregado, mês e dia.
              </p>
            </div>

            {/* Feature chips */}
            <div className="grid grid-cols-3 gap-3 max-w-md mx-auto pt-2">
              {[
                { icon: Users, label: "Encarregados" },
                { icon: Camera, label: "Fotos" },
                { icon: FolderTree, label: "Organização" },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-1.5 rounded-2xl p-3 border bg-white"
                  style={{ borderColor: "rgba(18,140,126,0.15)" }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: WA_TINT, color: WA_DARK }}
                  >
                    <Icon size={17} />
                  </div>
                  <span className="text-[11px] font-semibold" style={{ color: WA_DARK }}>
                    {label}
                  </span>
                </div>
              ))}
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
              <Link
                to="/painel"
                className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
                style={{
                  background: `linear-gradient(135deg, ${WA_PRIMARY}, ${WA_DEEP})`,
                  boxShadow: `0 10px 24px -8px ${WA_DEEP}99`,
                }}
              >
                <Camera size={16} />
                Acessar painel
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-colors"
                style={{
                  border: `1.5px solid ${WA_DEEP}`,
                  color: WA_DARK,
                  background: "white",
                }}
              >
                Entrar
              </Link>
            </div>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground pt-2">
              <ShieldCheck size={13} style={{ color: WA_DEEP }} />
              Conexão segura · Dados criptografados
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] text-muted-foreground mt-6">
          © {new Date().getFullYear()} Macro Ambiental · Painel interno
        </p>
      </div>
    </div>
  );
}
