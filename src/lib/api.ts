const BASE_URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL!

export async function appsScriptCall<T>(
  action: string,
  body: Record<string, unknown> = {},
  initData: string,
): Promise<T> {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, initData, ...body }),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error ?? 'Unknown error')
  return json.data as T
}
