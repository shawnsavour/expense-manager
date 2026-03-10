'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTelegramUser } from '@/hooks/useTelegramUser'
import { appsScriptCall } from '@/lib/api'
import BalanceTable from '@/components/BalanceTable'
import AddExpenseSheet from '@/components/AddExpenseSheet'
import SettlementSheet from '@/components/SettlementSheet'
import { getBaseUrl } from '@/lib/api'
import type { BalanceTransfer, Member } from '@/types'

export default function Home() {
  const { user, initData, ready } = useTelegramUser()

  const [members, setMembers] = useState<Member[]>([])
  const [balances, setBalances] = useState<BalanceTransfer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showAddExpense, setShowAddExpense] = useState(false)
  const [settlementTarget, setSettlementTarget] = useState<BalanceTransfer | null>(null)

  const loadData = useCallback(async () => {
    if (!initData) return
    setLoading(true)
    setError(null)
    try {
      const [bal, mem] = await Promise.all([
        appsScriptCall<BalanceTransfer[]>('getBalances', {}, initData),
        appsScriptCall<Member[]>('getMembers', {}, initData),
      ])
      setBalances(bal)
      setMembers(mem)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data.')
    } finally {
      setLoading(false)
    }
  }, [initData])

  // Wait until the Telegram WebApp hook has run before doing anything
  useEffect(() => {
    if (!ready) return
    if (!initData) {
      // Running outside Telegram (e.g. npm run dev in browser)
      setLoading(false)
      return
    }
    appsScriptCall('registerUser', {}, initData)
      .catch(console.error)
      .finally(() => loadData())
  }, [ready, initData, loadData])

  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? id

  // Not inside Telegram — show a helpful message instead of a blank spinner
  if (ready && !initData) {
    return (
      <main
        className="min-h-screen flex items-center justify-center px-6 text-center"
        style={{ background: 'var(--tg-theme-bg-color)' }}
      >
        <div className="flex flex-col gap-3">
          <span className="text-5xl">🤖</span>
          <p className="font-semibold text-lg" style={{ color: 'var(--tg-theme-text-color)' }}>
            Open in Telegram
          </p>
          <p className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>
            This app must be launched from the Telegram mini app.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main
      className="min-h-screen pb-28"
      style={{ background: 'var(--tg-theme-bg-color)' }}
    >
      {/* Header */}
      <header className="px-4 pt-6 pb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--tg-theme-text-color)' }}>
          Group Expenses
        </h1>
        {user && (
          <div
            className="flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold"
            style={{
              background: 'var(--tg-theme-button-color)',
              color: 'var(--tg-theme-button-text-color)',
            }}
            title={user.first_name}
          >
            {user.first_name[0].toUpperCase()}
          </div>
        )}
      </header>

      {/* Loading spinner */}
      {loading && (
        <div className="flex justify-center items-center py-28">
          <div
            className="w-9 h-9 border-2 border-current border-t-transparent rounded-full animate-spin"
            style={{ color: 'var(--tg-theme-button-color)' }}
          />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="mx-4 mt-4">
          <div
            className="rounded-2xl p-4 text-sm flex flex-col gap-3"
            style={{ background: 'var(--tg-theme-secondary-bg-color)' }}
          >
            <p className="font-semibold" style={{ color: 'var(--tg-theme-text-color)' }}>Load failed</p>
            <p className="font-mono text-xs break-all" style={{ color: '#ef4444' }}>{error}</p>
            <p className="text-xs break-all" style={{ color: 'var(--tg-theme-hint-color)' }}>
              URL: {getBaseUrl() ?? '(not set)'}
            </p>
            <button
              onClick={loadData}
              className="self-start text-sm font-semibold"
              style={{ color: 'var(--tg-theme-link-color)' }}
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Balance table */}
      {!loading && !error && (
        <BalanceTable
          balances={balances}
          memberName={memberName}
          onRowClick={setSettlementTarget}
        />
      )}

      {/* Floating + button */}
      <button
        onClick={() => setShowAddExpense(true)}
        className="fixed bottom-6 right-5 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-3xl font-light transition-transform active:scale-90"
        style={{
          background: 'var(--tg-theme-button-color)',
          color: 'var(--tg-theme-button-text-color)',
        }}
        aria-label="Add expense"
      >
        +
      </button>

      {/* Add Expense bottom sheet */}
      {showAddExpense && (
        <AddExpenseSheet
          members={members}
          initData={initData}
          onClose={() => setShowAddExpense(false)}
          onSuccess={() => {
            setShowAddExpense(false)
            loadData()
          }}
        />
      )}

      {/* Settlement bottom sheet */}
      {settlementTarget && (
        <SettlementSheet
          transfer={settlementTarget}
          members={members}
          initData={initData}
          onClose={() => setSettlementTarget(null)}
          onPaid={() => {
            setSettlementTarget(null)
            loadData()
          }}
        />
      )}
    </main>
  )
}
