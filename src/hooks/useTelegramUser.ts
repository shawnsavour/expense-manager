'use client'

import { useEffect, useState } from 'react'

export interface TelegramUser {
  id: number
  username?: string
  first_name: string
  last_name?: string
}

export function useTelegramUser() {
  const [user, setUser] = useState<TelegramUser | null>(null)
  const [initData, setInitData] = useState<string>('')
  // true once the effect has run — distinguishes "not checked yet" from "no Telegram context"
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (tg) {
      tg.ready()
      tg.expand()
      setUser(tg.initDataUnsafe?.user ?? null)
      setInitData(tg.initData)
    }
    setReady(true)
  }, [])

  return { user, initData, ready }
}
