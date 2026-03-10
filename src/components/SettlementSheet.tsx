'use client'

import { useEffect, useState } from 'react'
import BottomSheet from './BottomSheet'
import { appsScriptCall, isAppScriptEnabled } from '@/lib/api'
import { getBanksFromSheet, getExpensesFromSheet } from '@/lib/sheetsApi'
import type { BalanceTransfer, Bank, Expense, Member } from '@/types'

interface Props {
  transfer: BalanceTransfer
  members: Member[]
  initData: string
  onClose: () => void
  onPaid: () => void
}

export default function SettlementSheet({ transfer, members, initData, onClose, onPaid }: Props) {
  const [banks, setBanks] = useState<Bank[]>([])
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)
  const [error, setError] = useState('')

  const fromName = members.find((m) => m.id === transfer.from)?.name ?? transfer.from
  const toName = members.find((m) => m.id === transfer.to)?.name ?? transfer.to
  const writesEnabled = isAppScriptEnabled()

  useEffect(() => {
    const load = writesEnabled
      ? appsScriptCall<Bank[]>('getBanks', { memberId: transfer.to }, initData)
      : getBanksFromSheet(transfer.to)

    load
      .then(setBanks)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [transfer.to, initData, writesEnabled])

  const handleMarkPaid = async () => {
    setMarking(true)
    setError('')
    try {
      const expenses: Expense[] = writesEnabled
        ? await appsScriptCall<Expense[]>('getExpenses', {}, initData)
        : await getExpensesFromSheet()

      const unpaidRelated = expenses.filter((e) => {
        if (e.paid === true || e.paid === 'TRUE') return false
        try {
          const mems: string[] = JSON.parse(e.members)
          return e.payer === transfer.to && mems.includes(transfer.from)
        } catch {
          return false
        }
      })

      await Promise.all(
        unpaidRelated.map((e) =>
          appsScriptCall('markPaid', { expenseId: e.expense_id }, initData),
        ),
      )

      onPaid()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to mark as paid.')
    } finally {
      setMarking(false)
    }
  }

  return (
    <BottomSheet title="Settle Up" onClose={onClose}>
      <div className="flex flex-col gap-5">
        {/* Amount summary card */}
        <div
          className="rounded-2xl p-5 text-center"
          style={{ background: 'var(--tg-theme-secondary-bg-color)' }}
        >
          <p className="text-sm mb-1" style={{ color: 'var(--tg-theme-hint-color)' }}>
            {fromName} pays {toName}
          </p>
          <p className="text-4xl font-bold" style={{ color: 'var(--tg-theme-text-color)' }}>
            ฿{transfer.amount.toFixed(2)}
          </p>
        </div>

        {/* Bank / payment options */}
        {loading && (
          <div className="flex justify-center py-6">
            <div
              className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin"
              style={{ color: 'var(--tg-theme-button-color)' }}
            />
          </div>
        )}

        {!loading && banks.length === 0 && (
          <p className="text-center text-sm py-4" style={{ color: 'var(--tg-theme-hint-color)' }}>
            {toName} hasn&apos;t saved any payment details yet.
          </p>
        )}

        {!loading && banks.length > 0 && (
          <div className="flex flex-col gap-3">
            <p
              className="text-xs uppercase font-semibold tracking-wide"
              style={{ color: 'var(--tg-theme-hint-color)' }}
            >
              Payment options
            </p>
            {banks.map((bank) => (
              <div
                key={bank.bank_id}
                className="rounded-2xl p-4 flex flex-col gap-3"
                style={{ background: 'var(--tg-theme-secondary-bg-color)' }}
              >
                <div>
                  <p className="font-semibold text-base" style={{ color: 'var(--tg-theme-text-color)' }}>
                    {bank.alias}
                  </p>
                  {bank.number && (
                    <p className="text-sm mt-0.5" style={{ color: 'var(--tg-theme-hint-color)' }}>
                      {bank.number}
                    </p>
                  )}
                </div>
                {bank.qrcode && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={bank.qrcode}
                    alt={`QR code for ${bank.alias}`}
                    className="w-44 h-44 mx-auto rounded-xl object-contain"
                    style={{ background: '#ffffff' }}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm font-medium text-red-500">{error}</p>
        )}

        {writesEnabled ? (
          <button
            onClick={handleMarkPaid}
            disabled={marking}
            className="w-full py-4 rounded-xl font-semibold text-base transition-opacity disabled:opacity-50 active:opacity-80"
            style={{
              background: 'var(--tg-theme-button-color)',
              color: 'var(--tg-theme-button-text-color)',
            }}
          >
            {marking ? 'Marking…' : '✓ Mark as Paid'}
          </button>
        ) : (
          <p className="text-xs text-center pb-2" style={{ color: 'var(--tg-theme-hint-color)' }}>
            Mark as paid is unavailable while Apps Script is disabled.
          </p>
        )}
      </div>
    </BottomSheet>
  )
}
