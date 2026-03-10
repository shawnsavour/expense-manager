export interface Member {
  id: string
  telegram_id: string
  name: string
}

export interface Expense {
  expense_id: string
  date: string
  amount: number | string
  payer: string
  /** JSON-encoded string array of member IDs */
  members: string
  /** JSON-encoded object of custom shares, or empty string for equal split */
  splits: string
  type: 'equal' | 'custom'
  /** Sheets returns TRUE/FALSE as string or boolean */
  paid: boolean | string
  notes: string
}

export interface Bank {
  bank_id: string
  member_id: string
  alias: string
  number: string
  /** URL or base64 data URI of the QR code image */
  qrcode: string
}

export interface BalanceTransfer {
  from: string
  to: string
  amount: number
}
