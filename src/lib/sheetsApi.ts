import type { Bank, BalanceTransfer, Expense, Member } from '@/types'

const SPREADSHEET_ID = process.env.NEXT_PUBLIC_SPREADSHEET_ID!

// ---------------------------------------------------------------------------
// Generic gviz reader
// ---------------------------------------------------------------------------
// Google Sheets gviz endpoint works for publicly-shared spreadsheets without
// any API key. Response is JSONP-wrapped — we strip the wrapper and parse.

async function readSheet(sheetName: string): Promise<Record<string, unknown>[]> {
  const url =
    `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}` +
    `/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to read sheet "${sheetName}": HTTP ${res.status}`)

  const text = await res.text()

  // Strip JSONP wrapper: /*O_o*/\ngoogle.visualization.Query.setResponse({...});
  const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);\s*$/)
  if (!match) throw new Error(`Unexpected gviz response from sheet "${sheetName}"`)

  const json = JSON.parse(match[1])
  if (json.status !== 'ok') {
    const msg = json.errors?.[0]?.detailed_message ?? json.errors?.[0]?.message ?? 'Unknown error'
    throw new Error(`Sheet "${sheetName}" error: ${msg}`)
  }

  if (!json.table?.rows?.length) return []

  const cols: string[] = json.table.cols.map((c: { label: string }) => c.label)

  return json.table.rows
    .filter((row: { c: Array<{ v: unknown } | null> | null }) => row?.c?.[0]?.v != null)
    .map((row: { c: Array<{ v: unknown } | null> }) => {
      const obj: Record<string, unknown> = {}
      row.c.forEach((cell, i) => {
        obj[cols[i]] = cell?.v ?? ''
      })
      return obj
    })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getMembersFromSheet(): Promise<Member[]> {
  return readSheet('members') as unknown as Promise<Member[]>
}

export async function getExpensesFromSheet(): Promise<Expense[]> {
  return readSheet('expenses') as unknown as Promise<Expense[]>
}

export async function getBanksFromSheet(memberId: string): Promise<Bank[]> {
  const all = (await readSheet('banks')) as unknown as Bank[]
  return all.filter((b) => b.member_id === memberId)
}

// ---------------------------------------------------------------------------
// Client-side balance computation (mirrors Apps Script getBalances)
// ---------------------------------------------------------------------------

export function computeBalances(expenses: Expense[]): BalanceTransfer[] {
  const unpaid = expenses.filter(
    (e) => e.paid !== true && e.paid !== 'TRUE' && e.paid !== 'true',
  )

  const net: Record<string, number> = {}

  unpaid.forEach((exp) => {
    const amount = Number(exp.amount)
    const payer = String(exp.payer)

    let memberIds: string[]
    try {
      memberIds = JSON.parse(String(exp.members))
    } catch {
      return
    }

    let shares: Record<string, number>
    if (exp.type === 'custom' && exp.splits) {
      try {
        shares = JSON.parse(String(exp.splits))
      } catch {
        const each = amount / memberIds.length
        shares = Object.fromEntries(memberIds.map((m) => [m, each]))
      }
    } else {
      const each = amount / memberIds.length
      shares = Object.fromEntries(memberIds.map((m) => [m, each]))
    }

    net[payer] = (net[payer] ?? 0) + amount
    memberIds.forEach((m) => {
      net[m] = (net[m] ?? 0) - (shares[m] ?? 0)
    })
  })

  const creditors: { id: string; bal: number }[] = []
  const debtors: { id: string; bal: number }[] = []

  Object.entries(net).forEach(([id, bal]) => {
    if (bal > 0.005) creditors.push({ id, bal })
    if (bal < -0.005) debtors.push({ id, bal: -bal })
  })

  creditors.sort((a, b) => b.bal - a.bal)
  debtors.sort((a, b) => b.bal - a.bal)

  const transfers: BalanceTransfer[] = []
  let ci = 0
  let di = 0

  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci]
    const d = debtors[di]
    const amt = Math.min(c.bal, d.bal)
    transfers.push({ from: d.id, to: c.id, amount: Math.round(amt * 100) / 100 })
    c.bal -= amt
    d.bal -= amt
    if (c.bal < 0.005) ci++
    if (d.bal < 0.005) di++
  }

  return transfers
}
