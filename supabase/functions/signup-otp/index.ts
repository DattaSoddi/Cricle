type SignupOtpRequest = {
  action?: unknown;
  phone?: unknown;
  email?: unknown;
  challengeId?: unknown;
  emailCode?: unknown;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Server configuration is missing ${name}.`);
  return value;
}

async function databaseRequest(path: string, init: RequestInit = {}) {
  const baseUrl = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const headers = new Headers(init.headers);
  headers.set("apikey", serviceKey);
  headers.set("Authorization", `Bearer ${serviceKey}`);
  headers.set("Content-Type", "application/json");
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const details = await response.text();
    console.error("Supabase database request failed", response.status, details);
    throw new Error("The verification service could not access its database.");
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function generateCode() {
  const range = 900000;
  const limit = Math.floor(0x100000000 / range) * range;
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return String(100000 + (buffer[0] % range));
}

async function hashCode(challengeId: string, code: string) {
  const pepper = requiredEnv("OTP_PEPPER");
  if (pepper.length < 32) throw new Error("OTP_PEPPER must contain at least 32 characters.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${challengeId}:${code}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sendEmail(email: string, code: string) {
  const apiKey = requiredEnv("RESEND_API_KEY");
  const from = requiredEnv("RESEND_FROM_EMAIL");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Your Circle verification code",
      text: `Your Circle verification code is ${code}. It expires in 10 minutes.`,
    }),
  });
  if (!response.ok) {
    console.error("Email provider rejected the verification message", response.status);
    throw new Error("Email delivery failed. Check the email provider setup and try again.");
  }
}

async function sendCodes(phone: string, email: string, requesterHash: string) {
  const now = new Date();
  const oldRequestParams = new URLSearchParams({
    created_at: `lt.${new Date(now.getTime() - 60 * 60_000).toISOString()}`,
  });
  await databaseRequest(`circle_signup_otps?${oldRequestParams.toString()}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  const phoneHash = await hashCode("rate-limit", phone);
  const emailHash = await hashCode("rate-limit", email);
  const challengeId = crypto.randomUUID();
  const emailCode = generateCode();
  const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();
  const reservation = await databaseRequest("rpc/reserve_circle_signup_otp", {
    method: "POST",
    body: JSON.stringify({
      p_challenge_id: challengeId,
      p_phone_hash: phoneHash,
      p_email_hash: emailHash,
      p_requester_hash: requesterHash,
      p_phone_code_hash: null,
      p_email_code_hash: await hashCode(challengeId, emailCode),
      p_expires_at: expiresAt,
    }),
  });
  if (reservation !== "reserved") {
    const message = reservation?.endsWith("_minute")
      ? "Please wait a minute before requesting another code."
      : "Too many verification requests. Try again in an hour.";
    return jsonResponse({ error: message }, 429);
  }

  await sendEmail(email, emailCode);
  return jsonResponse({ challengeId });
}

async function verifyCodes(challengeId: string, emailCode: string) {
  if (!/^[0-9a-f-]{36}$/i.test(challengeId) || !/^\d{6}$/.test(emailCode)) {
    return jsonResponse({ error: "Enter the 6-digit code sent to your email address." }, 400);
  }
  const verified = await databaseRequest("rpc/verify_circle_signup_otp", {
    method: "POST",
    body: JSON.stringify({
        p_challenge_id: challengeId,
      p_phone_code_hash: null,
      p_email_code_hash: await hashCode(challengeId, emailCode),
    }),
  });
  if (verified !== true) {
    return jsonResponse({ error: "The code is incorrect, expired, or has already been used. Check it and try again." }, 400);
  }
  return jsonResponse({ verified: true });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Use POST for this endpoint." }, 405);

  try {
    const payload = await request.json() as SignupOtpRequest;
    if (payload.action === "send") {
      const phone = typeof payload.phone === "string" ? payload.phone : "";
      const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
      if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
        return jsonResponse({ error: "Enter a phone number in international format, such as +14155550132." }, 400);
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonResponse({ error: "Enter a valid email address." }, 400);
      }
      const forwardedFor = request.headers.get("x-forwarded-for")?.split(",").map((value) => value.trim()).pop() || "";
      const requesterAddress = request.headers.get("cf-connecting-ip")
        || request.headers.get("x-real-ip")
        || forwardedFor
        || "";
      const requesterHash = await hashCode(
        "rate-limit",
        requesterAddress || `contact:${phone}:${email}`,
      );
      return await sendCodes(phone, email, requesterHash);
    }
    if (payload.action === "verify") {
      return await verifyCodes(
        typeof payload.challengeId === "string" ? payload.challengeId : "",
        typeof payload.emailCode === "string" ? payload.emailCode : "",
      );
    }
    return jsonResponse({ error: "Unknown verification action." }, 400);
  } catch (error) {
    console.error("Signup OTP request failed", error);
    return jsonResponse({
      error: error instanceof Error ? error.message : "The verification service encountered an unexpected error.",
    }, 500);
  }
});
