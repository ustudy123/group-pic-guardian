import { CheckCircle2, Circle, Clock } from "lucide-react";

export type Progresso = {
  preRua: number;
  preRuaAprov: number;
  preCasa: number;
  preCasaAprov: number;
  posRua: number;
  posRuaAprov: number;
} | null | undefined;

export function statusRua(p: Progresso): "vazia" | "pre" | "aguarda_pos" | "concluida" {
  if (!p) return "vazia";
  const semFoto = p.preRua + p.preCasa + p.posRua === 0;
  if (semFoto) return "vazia";
  const preOk = p.preRuaAprov > 0; // basta ter ao menos uma foto de rua pré aprovada
  const posOk = p.posRuaAprov > 0 && p.posRuaAprov >= p.preRuaAprov;
  if (preOk && posOk) return "concluida";
  if (p.preRua > 0 && p.posRua === 0) return "aguarda_pos";
  return "pre";
}

export function BadgeStatusRua({ p }: { p: Progresso }) {
  const s = statusRua(p);
  const map = {
    vazia: { txt: "Pendente", cls: "bg-muted text-muted-foreground", icon: <Circle size={11} /> },
    pre: { txt: "Em andamento", cls: "bg-amber-100 text-amber-800", icon: <Clock size={11} /> },
    aguarda_pos: { txt: "Aguarda pós-obra", cls: "bg-blue-100 text-blue-800", icon: <Clock size={11} /> },
    concluida: { txt: "Concluída", cls: "bg-green-100 text-green-800", icon: <CheckCircle2 size={11} /> },
  } as const;
  const { txt, cls, icon } = map[s];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>
      {icon} {txt}
    </span>
  );
}

export function ContadoresRua({ p }: { p: Progresso }) {
  if (!p) return null;
  return (
    <div className="flex flex-wrap gap-1.5 text-[10px]">
      <Pill label="Pré rua" val={`${p.preRuaAprov}/${p.preRua}`} ok={p.preRuaAprov > 0 && p.preRuaAprov === p.preRua} />
      <Pill label="Pré casas" val={`${p.preCasaAprov}/${p.preCasa}`} ok={p.preCasa > 0 && p.preCasaAprov === p.preCasa} />
      <Pill label="Pós rua" val={`${p.posRuaAprov}/${p.posRua}`} ok={p.posRuaAprov > 0 && p.posRuaAprov === p.posRua} />
    </div>
  );
}

function Pill({ label, val, ok }: { label: string; val: string; ok: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${ok ? "border-green-300 bg-green-50 text-green-800" : "border-input bg-background text-muted-foreground"}`}>
      <span className="font-semibold">{label}</span>
      <span className="font-mono">{val}</span>
    </span>
  );
}
