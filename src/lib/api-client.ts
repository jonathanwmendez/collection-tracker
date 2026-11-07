// Calls the app's own API routes from the browser and returns errors as plain messages.

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; needsSignIn?: boolean; status: number };

export async function api<T = Record<string, unknown>>(path: string, init?: RequestInit & { json?: unknown }): Promise<ApiResult<T>> {
  const { json, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      ...(json !== undefined ? { body: JSON.stringify(json), headers: { "content-type": "application/json", ...(rest.headers ?? {}) } } : {}),
    });
  } catch {
    return { ok: false, error: "No connection. Check your internet and try again.", status: 0 };
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return {
      ok: false,
      error: typeof body.error === "string" ? body.error : "Something went wrong. Try again.",
      needsSignIn: Boolean(body.needsSignIn),
      status: res.status,
    };
  }
  return { ok: true, data: body as T };
}
