interface BottomSheetProps {
  title: string
  onClose: () => void
  children: React.ReactNode
}

export default function BottomSheet({ title, onClose, children }: BottomSheetProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative rounded-t-2xl flex flex-col max-h-[92vh]"
        style={{ background: 'var(--tg-theme-bg-color)' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div
            className="w-10 h-1 rounded-full opacity-40"
            style={{ background: 'var(--tg-theme-hint-color)' }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 shrink-0">
          <h2
            className="text-lg font-semibold"
            style={{ color: 'var(--tg-theme-text-color)' }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-xl leading-none"
            style={{ color: 'var(--tg-theme-hint-color)' }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-4 pb-8 pt-2">{children}</div>
      </div>
    </div>
  )
}
