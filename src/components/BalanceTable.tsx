import type { BalanceTransfer } from '@/types'

interface Props {
  balances: BalanceTransfer[]
  memberName: (id: string) => string
  onRowClick: (transfer: BalanceTransfer) => void
}

export default function BalanceTable({ balances, memberName, onRowClick }: Props) {
  if (balances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <span className="text-6xl">🎉</span>
        <p className="text-base font-medium" style={{ color: 'var(--tg-theme-hint-color)' }}>
          All settled up!
        </p>
      </div>
    )
  }

  return (
    <section className="px-4">
      <p
        className="text-xs uppercase font-semibold tracking-wide mb-3"
        style={{ color: 'var(--tg-theme-hint-color)' }}
      >
        Outstanding Balances
      </p>

      <ul
        className="rounded-2xl overflow-hidden divide-y"
        style={{
          background: 'var(--tg-theme-secondary-bg-color)',
          borderColor: 'rgba(0,0,0,0.06)',
        }}
      >
        {balances.map((t, i) => (
          <li key={i}>
            <button
              className="w-full flex items-center justify-between px-4 py-4 active:opacity-60 transition-opacity text-left"
              onClick={() => onRowClick(t)}
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span
                  className="font-semibold text-base truncate"
                  style={{ color: 'var(--tg-theme-text-color)' }}
                >
                  {memberName(t.from)}
                </span>
                <span className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>
                  owes&nbsp;
                  <span style={{ color: 'var(--tg-theme-text-color)' }}>
                    {memberName(t.to)}
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0 ml-4">
                <span
                  className="font-bold text-lg"
                  style={{ color: 'var(--tg-theme-link-color)' }}
                >
                  ฿{t.amount.toFixed(2)}
                </span>
                <span style={{ color: 'var(--tg-theme-hint-color)' }}>›</span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      <p className="text-xs mt-3 text-center" style={{ color: 'var(--tg-theme-hint-color)' }}>
        Tap a row to see payment options
      </p>
    </section>
  )
}
