const BASE_URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL!

export function getBaseUrl() {
  return BASE_URL
}

/** False when NEXT_PUBLIC_APPSCRIPT_ENABLED is explicitly set to "false". */
export function isAppScriptEnabled(): boolean {
  return process.env.NEXT_PUBLIC_APPSCRIPT_ENABLED !== 'false'
}

export async function appsScriptCall<T>(
  action: string,
  body: Record<string, unknown> = {},
  initData: string,
): Promise<T> {
  if (!BASE_URL || BASE_URL.includes('example.com')) {
    throw new Error('NEXT_PUBLIC_APPS_SCRIPT_URL is not configured.')
  }

  // Apps Script /exec issues a cross-origin 302 redirect. Browsers drop the POST body
  // when following cross-origin redirects, so the script receives nothing.
  // Workaround: encode everything as a single `payload` query parameter on a GET request.
  // GET redirects preserve query parameters, so the body survives the redirect.
  const url = new URL(BASE_URL)
  url.searchParams.set('payload', JSON.stringify({ action, initData, ...body }))

  const res = await fetch(url.toString(), { method: 'GET' })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`)
  }

  const json = await res.json()
  if (!json.ok) throw new Error(json.error ?? 'Unknown Apps Script error')
  return json.data as T
}
