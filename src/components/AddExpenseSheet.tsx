'use client'

import { useState, useEffect } from 'react'
import BottomSheet from './BottomSheet'
import { appsScriptCall } from '@/lib/api'
import type { Member } from '@/types'

interface Props {
  members: Member[]
  initData: string
  onClose: () => void
  onSuccess: () => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium" style={{ color: 'var(--tg-theme-hint-color)' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle = {
  background: 'var(--tg-theme-secondary-bg-color)',
  color: 'var(--tg-theme-text-color)',
  borderColor: 'transparent',
}

export default function AddExpenseSheet({ members, initData, onClose, onSuccess }: Props) {
  const today = new Date().toISOString().split('T')[0]

  const [date, setDate] = useState(today)
  const [amount, setAmount] = useState('')
  const [payer, setPayer] = useState(members[0]?.id ?? '')
  const [selectedMembers, setSelectedMembers] = useState<string[]>(members.map((m) => m.id))
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal')
  const [splits, setSplits] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Pre-fill custom splits with equal share whenever relevant state changes
  useEffect(() => {
    if (splitType !== 'custom') return
    const each = selectedMembers.length > 0 ? (parseFloat(amount) || 0) / selectedMembers.length : 0
    setSplits(
      Object.fromEntries(selectedMembers.map((id) => [id, each > 0 ? each.toFixed(2) : ''])),
    )
    // Intentionally only re-run when split type or selected members change, not on amount keystrokes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitType, selectedMembers.join(',')])

  const toggleMember = (id: string) => {
    setSelectedMembers((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]))
  }

  const amountNum = parseFloat(amount) || 0
  const splitsSum = Object.values(splits).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const splitsValid = splitType === 'equal' || Math.abs(splitsSum - amountNum) < 0.01

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Enter a valid amount.')
      return
    }
    if (!payer) {
      setError('Select who paid.')
      return
    }
    if (selectedMembers.length === 0) {
      setError('Select at least one member.')
      return
    }
    if (splitType === 'custom' && !splitsValid) {
      setError(
        `Custom splits must sum to ฿${amountNum.toFixed(2)} (currently ฿${splitsSum.toFixed(2)}).`,
      )
      return
    }

    setError('')
    setSubmitting(true)

    try {
      const splitsObj: Record<string, number> = {}
      if (splitType === 'custom') {
        selectedMembers.forEach((id) => {
          splitsObj[id] = parseFloat(splits[id]) || 0
        })
      }

      await appsScriptCall(
        'addExpense',
        {
          date,
          amount: amountNum,
          payer,
          members: selectedMembers,
          type: splitType,
          splits: splitType === 'custom' ? splitsObj : {},
          notes,
        },
        initData,
      )

      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add expense.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <BottomSheet title="Add Expense" onClose={onClose}>
      <div className="flex flex-col gap-5">
        {/* Date */}
        <Field label="Date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-3 rounded-xl border-0 outline-none text-base"
            style={inputStyle}
          />
        </Field>

        {/* Amount */}
        <Field label="Total Amount (฿)">
          <input
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-3 py-3 rounded-xl border-0 outline-none text-base"
            style={inputStyle}
          />
        </Field>

        {/* Payer */}
        <Field label="Paid by">
          <div className="grid grid-cols-3 gap-2">
            {members.map((m) => (
              <button
                key={m.id}
                onClick={() => setPayer(m.id)}
                className="py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={
                  payer === m.id
                    ? {
                        background: 'var(--tg-theme-button-color)',
                        color: 'var(--tg-theme-button-text-color)',
                      }
                    : {
                        background: 'var(--tg-theme-secondary-bg-color)',
                        color: 'var(--tg-theme-text-color)',
                      }
                }
              >
                {m.name}
              </button>
            ))}
          </div>
        </Field>

        {/* Members */}
        <Field label="Split between">
          <div className="rounded-xl overflow-hidden divide-y" style={{ background: 'var(--tg-theme-secondary-bg-color)' }}>
            {members.map((m) => (
              <label
                key={m.id}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedMembers.includes(m.id)}
                  onChange={() => toggleMember(m.id)}
                  className="w-4 h-4 accent-[color:var(--tg-theme-button-color)]"
                />
                <span style={{ color: 'var(--tg-theme-text-color)' }}>{m.name}</span>
              </label>
            ))}
          </div>
        </Field>

        {/* Split type toggle */}
        <Field label="Split type">
          <div
            className="flex rounded-xl overflow-hidden"
            style={{ background: 'var(--tg-theme-secondary-bg-color)' }}
          >
            {(['equal', 'custom'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setSplitType(t)}
                className="flex-1 py-3 text-sm font-semibold capitalize transition-colors"
                style={
                  splitType === t
                    ? {
                        background: 'var(--tg-theme-button-color)',
                        color: 'var(--tg-theme-button-text-color)',
                      }
                    : { color: 'var(--tg-theme-hint-color)' }
                }
              >
                {t}
              </button>
            ))}
          </div>
        </Field>

        {/* Custom splits */}
        {splitType === 'custom' && (
          <Field label={`Custom amounts — total ฿${amountNum.toFixed(2)}`}>
            <div className="flex flex-col gap-2">
              {selectedMembers.map((id) => {
                const member = members.find((m) => m.id === id)
                return (
                  <div key={id} className="flex items-center gap-3">
                    <span
                      className="w-24 text-sm truncate shrink-0"
                      style={{ color: 'var(--tg-theme-text-color)' }}
                    >
                      {member?.name ?? id}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={splits[id] ?? ''}
                      onChange={(e) => setSplits((prev) => ({ ...prev, [id]: e.target.value }))}
                      className="flex-1 px-3 py-2.5 rounded-xl border-0 outline-none text-sm"
                      style={{
                        background: 'var(--tg-theme-secondary-bg-color)',
                        color: 'var(--tg-theme-text-color)',
                      }}
                    />
                  </div>
                )
              })}
              <p
                className="text-xs text-right mt-1"
                style={{ color: splitsValid ? 'var(--tg-theme-hint-color)' : '#ef4444' }}
              >
                Sum: ฿{splitsSum.toFixed(2)} / ฿{amountNum.toFixed(2)}
              </p>
            </div>
          </Field>
        )}

        {/* Notes */}
        <Field label="Notes (optional)">
          <input
            type="text"
            placeholder="Dinner, groceries…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-3 rounded-xl border-0 outline-none text-base"
            style={inputStyle}
          />
        </Field>

        {error && (
          <p className="text-sm font-medium text-red-500">{error}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-4 rounded-xl font-semibold text-base transition-opacity disabled:opacity-50 active:opacity-80"
          style={{
            background: 'var(--tg-theme-button-color)',
            color: 'var(--tg-theme-button-text-color)',
          }}
        >
          {submitting ? 'Adding…' : 'Add Expense'}
        </button>
      </div>
    </BottomSheet>
  )
}
