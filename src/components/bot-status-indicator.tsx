import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { verificarStatusZapi } from "@/lib/grupos.functions";

export function BotStatusIndicator() {
  const check = useServerFn(verificarStatusZapi);
  const { data, isLoading } = useQuery({
    queryKey: ["zapi-status"],
    queryFn: () => check(),
    refetchInterval: 30_000,
  });

  const online = isLoading ? null : data?.connected ?? false;

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
