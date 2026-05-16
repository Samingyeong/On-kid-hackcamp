import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { clearHomeCache } from '../pages/Home'
import { clearDictCache } from '../api/library'
import type { User, Session } from '@supabase/supabase-js'

interface AuthContextType {
  user: User | null
  session: Session | null
  childName: string
  childCharacter: string
  childBirthDate: string
  loading: boolean
  signUp: (email: string, password: string, name: string, childData?: { childName: string; childBirth: string; childGender: string; disability: string }) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null; childCharacter?: string }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [childName, setChildName] = useState('')
  const [childCharacter, setChildCharacter] = useState('')
  const [childBirthDate, setChildBirthDate] = useState('')
  const [loading, setLoading] = useState(true)

  async function fetchChildName(userId: string) {
    try {
      const { data } = await supabase
        .from('children')
        .select('name, disability, birth_date')
        .eq('parent_id', userId)
        .limit(1)
        .single()
      setChildName(data?.name || '')
      setChildCharacter(data?.disability || '')
      setChildBirthDate(data?.birth_date || '')
      return data
    } catch {
      // 테이블 없거나 데이터 없으면 metadata에서 가져오기
      const meta = user?.user_metadata
      setChildName(meta?.child_name || '')
      setChildCharacter(meta?.disability || '')
      setChildBirthDate(meta?.child_birth || '')
      return {
        name: meta?.child_name || '',
        disability: meta?.disability || '',
        birth_date: meta?.child_birth || '',
      }
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) await fetchChildName(session.user.id)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setLoading(true)
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) await fetchChildName(session.user.id)
      else {
        setChildName('')
        setChildCharacter('')
        setChildBirthDate('')
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signUp(email: string, password: string, name: string, childData?: { childName: string; childBirth: string; childGender: string; disability: string }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          child_name: childData?.childName || '',
          child_birth: childData?.childBirth || '',
          child_gender: childData?.childGender || '',
          disability: childData?.disability || '',
        }
      },
    })
    if (error) return { error: error.message }

    if (data.session && data.user) {
      await saveProfileAndChild(data.user.id, name, email, childData)
    }

    return { error: null }
  }

  async function saveProfileAndChild(userId: string, name: string, email: string, childData?: { childName: string; childBirth: string; childGender: string; disability: string }) {
    try {
      await supabase.from('profiles').upsert({ id: userId, name, email })
    } catch {}

    if (childData?.childName) {
      try {
        const { data: existing } = await supabase
          .from('children')
          .select('id')
          .eq('parent_id', userId)
          .limit(1)

        if (!existing || existing.length === 0) {
          await supabase.from('children').insert({
            parent_id: userId,
            name: childData.childName,
            birth_date: childData.childBirth || null,
            gender: childData.childGender || null,
            disability: childData.disability || null,
          })
        }
      } catch {}
    }
  }

  async function signIn(email: string, password: string) {
    clearHomeCache()
    clearDictCache()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }

    if (data.user) {
      const meta = data.user.user_metadata
      let childProfile = null
      if (meta?.name) {
        await saveProfileAndChild(data.user.id, meta.name, email, {
          childName: meta.child_name || '',
          childBirth: meta.child_birth || '',
          childGender: meta.child_gender || '',
          disability: meta.disability || '',
        })
      }
      childProfile = await fetchChildName(data.user.id)
      return { error: null, childCharacter: childProfile?.disability || meta?.disability || '' }
    }

    return { error: null }
  }

  async function signOut() {
    try { await supabase.auth.signOut() } catch {}
    setUser(null)
    setSession(null)
    setChildName('')
    setChildCharacter('')
    setChildBirthDate('')
    clearHomeCache()
    clearDictCache()
  }

  return (
    <AuthContext.Provider value={{ user, session, childName, childCharacter, childBirthDate, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
