import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============ Roles do usuário logado ============
export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isPrivileged = (roles ?? []).some((r) => r.role === "admin" || r.role === "analista");
    return { roles: (roles ?? []).map((r) => r.role), isPrivileged };
  });

// ============ Reverse geocoding ============
// Prioriza Google Maps (via conector Lovable) por ser muito mais preciso no Brasil.
// Faz fallback para Nominatim/OpenStreetMap se o conector não estiver configurado.
async function googleReverse(lat: number, lon: number): Promise<string | null> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gmKey = process.env.LOVABLE_CONNECTOR_GOOGLE_MAPS_API_KEY;
  if (!lovableKey || !gmKey) return null;
  try {
    const url = `https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json?latlng=${lat},${lon}&language=pt-BR&region=br&result_type=street_address|premise|route`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gmKey,
      },
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    if (j.status !== "OK" || !Array.isArray(j.results) || j.results.length === 0) {
      // tenta sem filtro de tipo
      const url2 = `https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json?latlng=${lat},${lon}&language=pt-BR&region=br`;
      const r2 = await fetch(url2, {
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": gmKey,
        },
      });
      if (!r2.ok) return null;
      const j2: any = await r2.json();
      if (j2.status !== "OK" || !j2.results?.length) return null;
      return j2.results[0].formatted_address as string;
    }
    return j.results[0].formatted_address as string;
  } catch {
    return null;
  }
}

async function nominatimReverse(lat: number, lon: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1&accept-language=pt-BR&zoom=18`;
    const res = await fetch(url, {
      headers: { "User-Agent": "MacroAmbiental-Vistorias/1.0" },
    });
    if (!res.ok) return "";
    const j: any = await res.json();
    const a = j.address ?? {};
    const rua = a.road || a.pedestrian || a.path || "";
    const numero = a.house_number ? `, ${a.house_number}` : "";
    const bairro = a.suburb || a.neighbourhood || a.city_district || "";
    const cidade = a.city || a.town || a.village || a.municipality || "";
    const estado = a.state_code || a.state || "";
    const cep = a.postcode || "";
    const pais = a.country || "Brasil";
    const parts = [
      `${rua}${numero}`.trim(),
      bairro,
      `${cidade} ${estado}`.trim(),
      cep,
      pais,
    ].filter(Boolean);
    return parts.join(", ");
  } catch {
    return "";
  }
}

export const reverseGeocode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ lat: z.number(), lon: z.number() }).parse(input),
  )
  .handler(async ({ data }) => {
    const google = await googleReverse(data.lat, data.lon);
    if (google) return { address: google, source: "google" as const };
    const osm = await nominatimReverse(data.lat, data.lon);
    return { address: osm, source: "osm" as const };
  });

// ============ Listagens ============
export const listContratos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("contratos")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { contratos: data ?? [] };
  });

export const listBairros = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ contratoId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: bairros, error } = await context.supabase
      .from("bairros")
      .select("*")
      .eq("contrato_id", data.contratoId)
      .order("ordem")
      .order("nome");
    if (error) throw new Error(error.message);
    return { bairros: bairros ?? [] };
  });

export const listRuas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ bairroId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: ruas, error } = await context.supabase
      .from("ruas")
      .select("*")
      .eq("bairro_id", data.bairroId)
      .order("ordem")
      .order("nome");
    if (error) throw new Error(error.message);
    return { ruas: ruas ?? [] };
  });

// Minhas ruas (vistoriante) — ou todas se admin/analista
// Helper: agrega contadores de vistoria_fotos por rua para uma lista de rua_ids
async function getProgressoMap(supabase: any, ruaIds: string[]) {
  const map = new Map<string, { preRua: number; preRuaAprov: number; preCasa: number; preCasaAprov: number; posRua: number; posRuaAprov: number }>();
  if (!ruaIds.length) return map;
  const { data: rows } = await supabase
    .from("vistoria_fotos")
    .select("rua_id, fase, tipo, status")
    .in("rua_id", ruaIds);
  for (const id of ruaIds) {
    map.set(id, { preRua: 0, preRuaAprov: 0, preCasa: 0, preCasaAprov: 0, posRua: 0, posRuaAprov: 0 });
  }
  for (const r of (rows ?? []) as any[]) {
    const m = map.get(r.rua_id);
    if (!m) continue;
    const aprov = r.status === "aprovada";
    if (r.fase === "pre" && r.tipo === "rua") { m.preRua++; if (aprov) m.preRuaAprov++; }
    else if (r.fase === "pre" && r.tipo === "casa") { m.preCasa++; if (aprov) m.preCasaAprov++; }
    else if (r.fase === "pos") { m.posRua++; if (aprov) m.posRuaAprov++; }
  }
  return map;
}

export const listMinhasRuas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isPriv = (roles ?? []).some((r) => r.role === "admin" || r.role === "analista");

    let ruas: any[] = [];
    if (isPriv) {
      const { data, error } = await context.supabase
        .from("ruas")
        .select("id, nome, bairro_id, bairros(nome, contrato_id, contratos(numero, descricao))")
        .order("nome");
      if (error) throw new Error(error.message);
      ruas = data ?? [];
    } else {
      const { data: atrib, error: ae } = await context.supabase
        .from("vistoria_atribuicoes")
        .select("rua_id, ruas(id, nome, bairro_id, bairros(nome, contrato_id, contratos(numero, descricao)))")
        .eq("vistoriante_id", context.userId);
      if (ae) throw new Error(ae.message);
      ruas = (atrib ?? []).map((a: any) => a.ruas).filter(Boolean);
    }

    const progresso = await getProgressoMap(context.supabase, ruas.map((r) => r.id));
    const ruasComProgresso = ruas.map((r) => ({ ...r, progresso: progresso.get(r.id) }));
    return { ruas: ruasComProgresso, isPrivileged: isPriv };
  });

export const getRua = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ ruaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rua, error } = await context.supabase
      .from("ruas")
      .select("id, nome, bairro_id, bairros(id, nome, contrato_id, contratos(id, numero, descricao))")
      .eq("id", data.ruaId)
      .single();
    if (error) throw new Error(error.message);
    const progresso = (await getProgressoMap(context.supabase, [data.ruaId])).get(data.ruaId);
    return { rua, progresso };
  });


export const listFotosRua = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ ruaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: fotos, error } = await context.supabase
      .from("vistoria_fotos")
      .select("*")
      .eq("rua_id", data.ruaId)
      .order("captured_at", { ascending: true });
    if (error) throw new Error(error.message);

    // Gera signed URLs (1h) para preview
    const withUrls = await Promise.all(
      (fotos ?? []).map(async (f: any) => {
        const { data: signed } = await context.supabase.storage
          .from("vistorias-fotos")
          .createSignedUrl(f.storage_path_carimbada, 3600);
        return { ...f, url: signed?.signedUrl ?? null };
      }),
    );
    return { fotos: withUrls };
  });

// ============ Salvar foto (upload feito do client) ============
export const saveFoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        ruaId: z.string().uuid(),
        fase: z.enum(["pre", "pos"]),
        tipo: z.enum(["rua", "casa"]),
        numeroCasa: z.string().max(20).optional().nullable(),
        lado: z.enum(["E", "D"]).optional().nullable(),
        latitude: z.number().nullable(),
        longitude: z.number().nullable(),
        endereco: z.string().max(500).nullable(),
        capturedAt: z.string(),
        storagePathOriginal: z.string().max(500),
        storagePathCarimbada: z.string().max(500),
        parPreId: z.string().uuid().nullable().optional(),
        exif: z.record(z.string(), z.unknown()).optional().default({}),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("vistoria_fotos")
      .insert({
        rua_id: data.ruaId,
        fase: data.fase,
        tipo: data.tipo,
        numero_casa: data.numeroCasa ?? null,
        lado: data.lado ?? null,
        latitude: data.latitude,
        longitude: data.longitude,
        endereco_formatado: data.endereco,
        captured_at: data.capturedAt,
        storage_path_original: data.storagePathOriginal,
        storage_path_carimbada: data.storagePathCarimbada,
        par_pre_id: data.parPreId ?? null,
        exif: (data.exif ?? {}) as never,
        enviado_por: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { foto: row };
  });

export const setFotoStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        fotoId: z.string().uuid(),
        status: z.enum(["pendente", "aprovada", "rejeitada"]),
        observacao: z.string().max(500).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("vistoria_fotos")
      .update({ status: data.status, observacao: data.observacao ?? null })
      .eq("id", data.fotoId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteFoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ fotoId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: foto } = await context.supabase
      .from("vistoria_fotos")
      .select("storage_path_original, storage_path_carimbada")
      .eq("id", data.fotoId)
      .single();
    if (foto) {
      await context.supabase.storage
        .from("vistorias-fotos")
        .remove([foto.storage_path_original, foto.storage_path_carimbada].filter(Boolean) as string[]);
    }
    const { error } = await context.supabase
      .from("vistoria_fotos")
      .delete()
      .eq("id", data.fotoId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ CRUD admin ============
export const upsertContrato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid().optional(),
        numero: z.string().min(1).max(100),
        descricao: z.string().max(2000).optional().nullable(),
        regional: z.string().max(200).optional().nullable(),
        municipio: z.string().max(200).optional().nullable(),
        responsavel_tecnico: z.string().max(200).optional().nullable(),
        periodo: z.string().max(200).optional().nullable(),
        ativo: z.boolean().optional().default(true),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    if (id) {
      const { error } = await context.supabase.from("contratos").update(rest).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: row, error } = await context.supabase
      .from("contratos")
      .insert(rest)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteContrato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("contratos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upsertBairro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid().optional(),
        contrato_id: z.string().uuid(),
        nome: z.string().min(1).max(200),
        mapa_url: z.string().max(1000).optional().nullable(),
        ordem: z.number().int().optional().default(0),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    if (id) {
      const { error } = await context.supabase.from("bairros").update(rest).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: row, error } = await context.supabase
      .from("bairros")
      .insert(rest)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteBairro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("bairros").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upsertRua = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid().optional(),
        bairro_id: z.string().uuid(),
        nome: z.string().min(1).max(200),
        ordem: z.number().int().optional().default(0),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    if (id) {
      const { error } = await context.supabase.from("ruas").update(rest).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: row, error } = await context.supabase
      .from("ruas")
      .insert(rest)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteRua = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ruas").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Atribuições
export const listAtribuicoesRua = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ ruaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("vistoria_atribuicoes")
      .select("id, vistoriante_id, fase, profiles!inner(email, display_name)")
      .eq("rua_id", data.ruaId);
    if (error) throw new Error(error.message);
    return { atribuicoes: rows ?? [] };
  });

export const addAtribuicao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        ruaId: z.string().uuid(),
        vistorianteId: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("vistoria_atribuicoes")
      .insert({ rua_id: data.ruaId, vistoriante_id: data.vistorianteId, fase: "ambas" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeAtribuicao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("vistoria_atribuicoes")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
