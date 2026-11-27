import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { Profile } from '@/types/database'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  authError: string | null
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, department:departments(*)')
      .eq('id', userId)
      .single()

    if (error) {
      setAuthError('Không thể tải hồ sơ nhân viên. Vui lòng liên hệ Quản trị viên.')
      setProfile(null)
      return
    }
    if (!data.is_active) {
      setAuthError('Tài khoản của bạn đã bị tạm khóa. Vui lòng liên hệ Quản trị viên.')
      setProfile(null)
      await supabase.auth.signOut()
      return
    }
    setAuthError(null)
    setProfile(data as Profile)
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    let mounted = true
    supabase.auth.getSession().then(async ({ data: { session: currentSession } }) => {
      if (!mounted) return
      setSession(currentSession)
      if (currentSession?.user) {
        await fetchProfile(currentSession.user.id)
      }
      setLoading(false)
    })

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!mounted) return
      setSession(nextSession)
      if (nextSession?.user) {
        await fetchProfile(nextSession.user.id)
      } else {
        setProfile(null)
        queryClient.clear()
      }
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [fetchProfile, queryClient])

  const signIn = useCallback(async (email: string, password: string) => {
    setAuthError(null)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      return { error: error.message === 'Invalid login credentials' ? 'Email hoặc mật khẩu không đúng.' : error.message }
    }
    if (data.user) {
      await fetchProfile(data.user.id)
    }
    return { error: null }
  }, [fetchProfile])

  const signOut = useCallback(async () => {
    queryClient.clear()
    setProfile(null)
    setSession(null)
    // Xóa cache trình duyệt nếu có để bảo vệ dữ liệu khách hàng
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k.includes('api')).map((k) => caches.delete(k)))
    }
    await supabase.auth.signOut()
  }, [queryClient])

  const refreshProfile = useCallback(async () => {
    if (session?.user) {
      await fetchProfile(session.user.id)
    }
  }, [fetchProfile, session])

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        authError,
        signIn,
        signOut,
        refreshProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
