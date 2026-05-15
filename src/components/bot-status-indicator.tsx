import { useEffect, useState } from "react";

const BOT_URL = "https://bot-macro-ambiental-production.up.railway.app/";

export function BotStatusIndicator() {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(BOT_URL, { cache: "no-store" });
        const json = await res.json();
        if (!cancelled) setOnline(json?.ok === true);
      } catch {
        if (!cancelled) setOnline(false);
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const color =
    online === null ? "text-muted-foreground" : online ? "text-green-600" : "text-red-600";
  const label =
    online === null ? "Verificando bot..." : online ? "Bot online" : "Bot offline";

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${color}`}>
      <span className="text-base leading-none">●</span>
      {label}
    </span>
  );
}
