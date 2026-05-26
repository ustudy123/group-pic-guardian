import { useRef, useState } from "react";
import { Camera, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { reverseGeocode, saveFoto } from "@/lib/vistorias.functions";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  ruaId: string;
  fase: "pre" | "pos";
  tipo: "rua" | "casa";
  numeroCasa?: string | null;
  lado?: "E" | "D" | null;
  parPreId?: string | null;
  refUrl?: string | null; // foto pré pra mostrar como referência no pós
  onSaved?: () => void;
};

// Faz várias leituras de GPS por até ~10s e devolve a de melhor precisão.
// Aceita rápido se já chegou abaixo de 15m; caso contrário, continua amostrando.
function getGps(
  onProgress?: (accuracy: number, samples: number) => void,
): Promise<{ lat: number; lon: number; accuracy: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);

    let best: { lat: number; lon: number; accuracy: number } | null = null;
    let samples = 0;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      try { navigator.geolocation.clearWatch(watchId); } catch {}
      clearTimeout(hardTimeout);
      resolve(best);
    };

    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        samples++;
        const acc = p.coords.accuracy ?? 9999;
        if (!best || acc < best.accuracy) {
          best = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: acc };
        }
        onProgress?.(best.accuracy, samples);
        // Bom o bastante: encerra cedo
        if (best.accuracy <= 15) finish();
      },
      () => {
        // Em caso de erro encerra com o que tiver
        finish();
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );

    // Limite máximo de 10s amostrando
    const hardTimeout = setTimeout(finish, 10000);
  });
}

async function readImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

function drawStamp(canvas: HTMLCanvasElement, lines: string[]) {
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width;
  const fontSize = Math.max(14, Math.round(w * 0.022));
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
  ctx.textBaseline = "bottom";
  const padding = Math.round(w * 0.015);
  const lineH = Math.round(fontSize * 1.25);
  const totalH = lineH * lines.length + padding * 2;
  // fundo
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, canvas.height - totalH, w, totalH);
  // texto
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 4;
  lines.forEach((line, i) => {
    ctx.fillText(line, padding, canvas.height - padding - (lines.length - 1 - i) * lineH);
  });
  ctx.shadowBlur = 0;
}

export function FotoCaptura({ ruaId, fase, tipo, numeroCasa, lado, parPreId, refUrl, onSaved }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const saveFotoFn = useServerFn(saveFoto);
  const geocodeFn = useServerFn(reverseGeocode);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      setProgress("Obtendo localização precisa...");
      const gps = await getGps((acc, n) => {
        setProgress(`GPS: ±${Math.round(acc)}m (${n} leituras)`);
      });

      if (!gps) {
        toast.error("Não foi possível obter a localização. Ative o GPS e tente novamente.");
        setBusy(false);
        setProgress("");
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      if (gps.accuracy > 60) {
        const ok = confirm(
          `A precisão do GPS está baixa (±${Math.round(gps.accuracy)}m). O endereço pode ficar impreciso.\n\nDicas:\n• Vá para um local aberto, longe de prédios\n• Aguarde alguns segundos e tente de novo\n\nDeseja continuar mesmo assim?`,
        );
        if (!ok) {
          setBusy(false);
          setProgress("");
          if (inputRef.current) inputRef.current.value = "";
          return;
        }
      }

      setProgress("Buscando endereço...");
      const r = await geocodeFn({ data: { lat: gps.lat, lon: gps.lon } });
      const address = r.address;

      setProgress("Processando imagem...");
      const img = await readImage(file);
      // Reduz pra max 2000px para economizar banda
      const maxSide = 2000;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      // canvas original (sem carimbo, só redimensionado)
      const origCanvas = document.createElement("canvas");
      origCanvas.width = w;
      origCanvas.height = h;
      origCanvas.getContext("2d")!.drawImage(img, 0, 0, w, h);

      // canvas carimbado
      const stampCanvas = document.createElement("canvas");
      stampCanvas.width = w;
      stampCanvas.height = h;
      stampCanvas.getContext("2d")!.drawImage(img, 0, 0, w, h);

      const now = new Date();
      const dataHora = now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      const lines = [`${dataHora}  ·  GPS ±${Math.round(gps.accuracy)}m`];
      if (address) lines.push(...address.split(", ").reduce<string[]>((acc, cur) => {
        // junta em pares pra não ficar 1 palavra por linha
        if (acc.length === 0) return [cur];
        const last = acc[acc.length - 1];
        if ((last + ", " + cur).length < 60) acc[acc.length - 1] = last + ", " + cur;
        else acc.push(cur);
        return acc;
      }, []));
      drawStamp(stampCanvas, lines);

      const origBlob: Blob = await new Promise((res) =>
        origCanvas.toBlob((b) => res(b!), "image/jpeg", 0.85),
      );
      const stampBlob: Blob = await new Promise((res) =>
        stampCanvas.toBlob((b) => res(b!), "image/jpeg", 0.85),
      );

      setProgress("Enviando...");
      const ts = now.toISOString().replace(/[:.]/g, "-");
      const base = `${ruaId}/${fase}/${ts}-${crypto.randomUUID()}`;
      const pathOrig = `${base}/original.jpg`;
      const pathStamp = `${base}/carimbada.jpg`;

      const up1 = await supabase.storage.from("vistorias-fotos").upload(pathOrig, origBlob, {
        contentType: "image/jpeg",
      });
      if (up1.error) throw new Error(up1.error.message);
      const up2 = await supabase.storage.from("vistorias-fotos").upload(pathStamp, stampBlob, {
        contentType: "image/jpeg",
      });
      if (up2.error) throw new Error(up2.error.message);

      await saveFotoFn({
        data: {
          ruaId,
          fase,
          tipo,
          numeroCasa: numeroCasa ?? null,
          lado: lado ?? null,
          latitude: gps?.lat ?? null,
          longitude: gps?.lon ?? null,
          endereco: address || null,
          capturedAt: now.toISOString(),
          storagePathOriginal: pathOrig,
          storagePathCarimbada: pathStamp,
          parPreId: parPreId ?? null,
          exif: { fileName: file.name, fileSize: file.size },
        },
      });
      toast.success("Foto salva!");
      onSaved?.();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao salvar foto");
    } finally {
      setBusy(false);
      setProgress("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      {refUrl && (
        <div className="rounded-lg overflow-hidden border-2 border-dashed border-primary/40">
          <div className="bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wide flex items-center gap-1.5">
            <MapPin size={12} /> Foto de referência (pré-obra) — alinhe o mesmo ângulo
          </div>
          <img src={refUrl} alt="referência" className="w-full max-h-72 object-contain bg-black" />
        </div>
      )}
      <label className={`flex items-center justify-center gap-2 w-full rounded-xl border-2 border-dashed py-8 cursor-pointer transition ${busy ? "opacity-50 pointer-events-none" : "hover:bg-accent"}`}>
        {busy ? <Loader2 className="animate-spin" /> : <Camera />}
        <span className="font-semibold">{busy ? progress || "Processando..." : "Tirar foto"}</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePick}
          disabled={busy}
        />
      </label>
    </div>
  );
}
