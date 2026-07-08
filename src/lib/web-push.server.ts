// Envio de Web Push (notificações do Portal do Encarregado).
// Implementação leve com WebCrypto (funciona em Cloudflare Workers e Node):
// assina o JWT VAPID (ES256) e envia push SEM payload — o service worker
// (public/sw.js) mostra uma notificação genérica que abre o /portal.
// As chaves VAPID ficam na tabela push_config (service_role) com fallback em env.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const VAPID_SUBJECT = "mailto:contato@ustudy.com.br";

function b64url(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let vapidCache: { publicKey: string; privateJwk: JsonWebKey } | null = null;

async function getVapid(): Promise<{ publicKey: string; privateJwk: JsonWebKey } | null> {
  if (vapidCache) return vapidCache;
  const envPub = process.env.VAPID_PUBLIC_KEY;
  const envPriv = process.env.VAPID_PRIVATE_JWK;
  if (envPub && envPriv) {
    vapidCache = { publicKey: envPub, privateJwk: JSON.parse(envPriv) };
    return vapidCache;
  }
  const { data } = await supabaseAdmin
    .from("push_config")
    .select("vapid_public, vapid_private_jwk")
    .eq("id", "default")
    .maybeSingle();
  if (!data) return null;
  vapidCache = {
    publicKey: data.vapid_public as string,
    privateJwk: JSON.parse(data.vapid_private_jwk as string),
  };
  return vapidCache;
}

async function vapidAuthorization(endpoint: string): Promise<string | null> {
  const vapid = await getVapid();
  if (!vapid) return null;
  const { origin } = new URL(endpoint);
  const header = b64url(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64url(
    new TextEncoder().encode(
      JSON.stringify({
        aud: origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: VAPID_SUBJECT,
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    "jwk",
    vapid.privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `vapid t=${header}.${payload}.${b64url(sig)}, k=${vapid.publicKey}`;
}

/** Envia um push (sem payload) para uma inscrição. Retorna o status HTTP. */
async function sendToEndpoint(endpoint: string): Promise<number> {
  const auth = await vapidAuthorization(endpoint);
  if (!auth) return 0;
  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: auth, TTL: "86400", Urgency: "high" },
    });
    return r.status;
  } catch (e) {
    console.error("[web-push] erro no envio:", e);
    return 0;
  }
}

/**
 * Notifica todos os aparelhos de um usuário. Inscrições expiradas (404/410)
 * são removidas. O texto exibido é o padrão do service worker (push sem
 * payload): "Você tem novos avisos no portal."
 */
export async function pushParaUsuario(userId: string): Promise<{ enviados: number }> {
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint")
    .eq("user_id", userId);
  if (!subs?.length) return { enviados: 0 };

  let enviados = 0;
  for (const s of subs) {
    const status = await sendToEndpoint(s.endpoint as string);
    if (status >= 200 && status < 300) enviados++;
    else if (status === 404 || status === 410) {
      await supabaseAdmin.from("push_subscriptions").delete().eq("id", s.id);
    }
  }
  return { enviados };
}
