// Configuração do cabeçalho do relatório em PDF, por formulário.
//
// Fica num JSON no storage (formularios/{id}/relatorio.json), ao lado do logo,
// para não depender de coluna nova no banco — as migrations deste projeto não
// são aplicadas sozinhas, e assim a opção funciona no deploy sem SQL manual.
// O bucket permite inserir/apagar mas não sobrescrever: salvar = apagar + subir.
import { supabase } from "@/integrations/supabase/client";

export const RELATORIO_CONFIG_PATH = (formularioId: string) =>
  `formularios/${formularioId}/relatorio.json`;

/** Nome que aparece no canto esquerdo do cabeçalho quando não há configuração. */
export const NOME_CABECALHO_PADRAO = "MacroAmbiental";

export type NomeModo = "padrao" | "personalizado" | "nenhum";
export type ConfigRelatorio = { nomeModo: NomeModo; nome: string };

export const CONFIG_RELATORIO_PADRAO: ConfigRelatorio = { nomeModo: "padrao", nome: "" };

export async function lerConfigRelatorio(formularioId: string): Promise<ConfigRelatorio> {
  try {
    const { data, error } = await supabase.storage
      .from("fotos-obras")
      .download(RELATORIO_CONFIG_PATH(formularioId));
    if (error || !data) return CONFIG_RELATORIO_PADRAO;
    const bruto = JSON.parse(await data.text()) as Partial<ConfigRelatorio>;
    const nomeModo: NomeModo =
      bruto.nomeModo === "personalizado" || bruto.nomeModo === "nenhum" ? bruto.nomeModo : "padrao";
    return { nomeModo, nome: typeof bruto.nome === "string" ? bruto.nome : "" };
  } catch {
    return CONFIG_RELATORIO_PADRAO;
  }
}

export async function salvarConfigRelatorio(formularioId: string, cfg: ConfigRelatorio) {
  const path = RELATORIO_CONFIG_PATH(formularioId);
  await supabase.storage.from("fotos-obras").remove([path]); // pode não existir ainda
  const blob = new Blob([JSON.stringify(cfg)], { type: "application/json" });
  const { error } = await supabase.storage
    .from("fotos-obras")
    .upload(path, blob, { contentType: "application/json" });
  if (error) throw error;
}

/** Texto do cabeçalho a usar: null = não imprimir nome. */
export function nomeCabecalhoDe(cfg: ConfigRelatorio): string | null {
  if (cfg.nomeModo === "nenhum") return null;
  if (cfg.nomeModo === "personalizado") return cfg.nome.trim() || NOME_CABECALHO_PADRAO;
  return NOME_CABECALHO_PADRAO;
}
