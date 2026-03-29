import { createClient } from "@supabase/supabase-js";

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

type PushTokenRow = {
  expo_push_token: string;
};

type OpenRequestPayload = {
  id: string;
  message: string | null;
  target_ngo_name: string | null;
  target_state: string | null;
  target_district: string | null;
  target_city: string | null;
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const expectedSecret = Deno.env.get("PUSH_WEBHOOK_SECRET");
  const providedSecret = req.headers.get("x-push-webhook-secret");

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response("Missing Supabase env", { status: 500 });
  }

  let payload: OpenRequestPayload;

  try {
    payload = (await req.json()) as OpenRequestPayload;
  } catch {
    return new Response("Invalid JSON payload", { status: 400 });
  }

  if (!payload?.id) {
    return new Response("Missing request id", { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  let ngoDirectoryQuery = supabase
    .from("ngo_directory")
    .select("id")
    .eq("is_active", true);

  const targetNgoName = payload.target_ngo_name?.trim();
  const targetState = payload.target_state?.trim();
  const targetDistrict = payload.target_district?.trim();
  const targetCity = payload.target_city?.trim();

  if (targetNgoName) {
    ngoDirectoryQuery = ngoDirectoryQuery.eq("name", targetNgoName);
  }

  if (targetState) {
    ngoDirectoryQuery = ngoDirectoryQuery.eq("state", targetState);
  }

  if (targetDistrict) {
    ngoDirectoryQuery = ngoDirectoryQuery.eq("district", targetDistrict);
  }

  if (targetCity) {
    ngoDirectoryQuery = ngoDirectoryQuery.eq("city", targetCity);
  }

  const { data: ngoRows, error: ngoDirectoryError } = await ngoDirectoryQuery;
  if (ngoDirectoryError) {
    return new Response(`NGO lookup failed: ${ngoDirectoryError.message}`, {
      status: 500,
    });
  }

  const ngoIds = ((ngoRows ?? []) as Array<{ id: string }>)
    .map((row) => row.id)
    .filter((id) => Boolean(id));

  if (ngoIds.length === 0) {
    return Response.json(
      {
        sent: 0,
        reason: "no_matching_ngo_for_request",
        requestId: payload.id,
      },
      { status: 200 },
    );
  }

  const { data: tokens, error: tokenError } = await supabase
    .from("device_push_tokens")
    .select("expo_push_token")
    .eq("role", "ngo")
    .eq("is_active", true)
    .in("user_id", ngoIds);

  if (tokenError) {
    return new Response(`Token query failed: ${tokenError.message}`, {
      status: 500,
    });
  }

  const uniqueTokens = Array.from(
    new Set(
      ((tokens ?? []) as PushTokenRow[])
        .map((row) => row.expo_push_token?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (uniqueTokens.length === 0) {
    return Response.json({ sent: 0, reason: "no_ngo_tokens" }, { status: 200 });
  }

  const previewId = payload.id.slice(0, 8).toUpperCase();
  const title = payload.target_ngo_name?.trim()
    ? `New SOS for ${payload.target_ngo_name.trim()}`
    : "New SOS Request";
  const body =
    payload.message?.trim() || `Request #${previewId} needs support.`;

  const messages = uniqueTokens.map((to) => ({
    to,
    sound: "default",
    title,
    body,
    data: {
      type: "new_open_request",
      requestId: payload.id,
      targetNgoName: payload.target_ngo_name,
      targetState: payload.target_state,
      targetDistrict: payload.target_district,
      targetCity: payload.target_city,
    },
    channelId: "requests",
    priority: "high",
  }));

  const sendResp = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });

  if (!sendResp.ok) {
    const text = await sendResp.text();
    return new Response(`Expo push failed: ${text}`, { status: 502 });
  }

  const responseBody = await sendResp.json();

  return Response.json(
    {
      sent: uniqueTokens.length,
      requestId: payload.id,
      expoResponse: responseBody,
    },
    { status: 200 },
  );
});
