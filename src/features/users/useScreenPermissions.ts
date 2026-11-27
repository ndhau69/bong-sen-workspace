import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { DEFAULT_ROLE_VISIBILITY, type ScreenKey } from './screenConfig'

interface RoleScreenRow {
  role: string
  screen_key: ScreenKey
  is_visible: boolean
}

interface UserScreenRow {
  user_id: string
  screen_key: ScreenKey
  is_visible: boolean
}

export function useScreenPermissions() {
  const { profile } = useAuth()

  const { data: roleRows = [], isLoading: loadingRole } = useQuery({
    queryKey: ['my-role-screen-permissions', profile?.role],
    enabled: Boolean(profile?.role),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('role_screen_permissions')
        .select('role, screen_key, is_visible')
        .eq('role', profile!.role)
      if (error) throw error
      return data as RoleScreenRow[]
    }
  })

  const { data: userRows = [], isLoading: loadingUser } = useQuery({
    queryKey: ['my-user-screen-permissions', profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_screen_permissions')
        .select('user_id, screen_key, is_visible')
        .eq('user_id', profile!.id)
      if (error) throw error
      return data as UserScreenRow[]
    }
  })

  const visibilityMap = useMemo(() => {
    const role = profile?.role || 'staff'
    const result: Record<ScreenKey, boolean> = { ...DEFAULT_ROLE_VISIBILITY[role] }

    for (const r of roleRows) {
      if (r.screen_key in result) {
        result[r.screen_key] = r.is_visible
      }
    }

    for (const u of userRows) {
      if (u.screen_key in result) {
        result[u.screen_key] = u.is_visible
      }
    }

    // Luôn bảo vệ màn hình User & Phân quyền cho Admin tránh tự khóa mình
    if (role === 'admin') {
      result.user_access = true
    }

    return result
  }, [profile?.role, roleRows, userRows])

  return {
    visibilityMap,
    isLoading: loadingRole || loadingUser,
    isScreenVisible: (key: ScreenKey) => Boolean(visibilityMap[key])
  }
}
