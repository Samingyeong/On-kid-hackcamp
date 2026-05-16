import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { clearHomeCache } from '../pages/Home'
import { clearDictCache } from '../api/library'
import type { User, Session } from '@supabase/supabase-js'

interface AuthContextType {
  user: User | null
  session: Session | null
  childName: string
  loading: boolean
  signUp: (email: string, password: string, name: string, childData?: { childName: string; childBirth: string; childGender: string; disability: string }) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [childName, setChildName] = useState('')
  const [loading, setLoading] = useState(true)

  async function fetchChildName(userId: string) {
    const { data } = await supabase
      .from('children')
      .select('name')
      .eq('parent_id', userId)
      .limit(1)
      .single()
    setChildName(data?.name || '')
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) fetchChildName(session.user.id)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) fetchChildName(session.user.id)
      else setChildName('')
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signUp(email: string, password: string, name: string, childData?: { childName: string; childBirth: string; childGender: string; disability: string }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name }
      },
    })
    if (error) return { error: error.message }

    // 프로필 + 아이 정보 저장
    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        name,
        email,
      })

      if (childData?.childName) {
        await supabase.from('children').insert({
          parent_id: data.user.id,
          name: childData.childName,
          birth_date: childData.childBirth || null,
          gender: childData.childGender || null,
          disability: childData.disability || null,
        })
      }
    }

    return { error: null }
  }

  async function signIn(email: string, password: string) {
    clearHomeCache()
    clearDictCache()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    clearHomeCache()
    clearDictCache()
  }

  return (
    <AuthContext.Provider value={{ user, session, childName, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
