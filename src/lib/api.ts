const BASE_URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL!

export function getBaseUrl() {
  return BASE_URL
}

export async function appsScriptCall<T>(
  action: string,
  body: Record<string, unknown> = {},
  initData: string,
): Promise<T> {
  if (!BASE_URL || BASE_URL.includes('example.com')) {
    throw new Error('NEXT_PUBLIC_APPS_SCRIPT_URL is not configured.')
  }

  // Use text/plain to avoid CORS preflight — Apps Script cannot respond to OPTIONS.
  // The JSON string in the body is still parsed normally by JSON.parse(e.postData.contents).
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, initData, ...body }),
  })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`)
  }

  const json = await res.json()
  if (!json.ok) throw new Error(json.error ?? 'Unknown Apps Script error')
  return json.data as T
}
