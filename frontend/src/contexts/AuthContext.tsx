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
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
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
    const { data } = await supabase
      .from('children')
      .select('name, disability, birth_date')
      .eq('parent_id', userId)
      .limit(1)
      .single()
    setChildName(data?.name || '')
    setChildCharacter(data?.disability || '')
    setChildBirthDate(data?.birth_date || '')
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) await fetchChildName(session.user.id)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) await fetchChildName(session.user.id)
      else { setChildName(''); setChildCharacter(''); setChildBirthDate('') }
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

    // 세션이 있으면 바로 테이블에 저장 (이메일 확인 꺼진 경우)
    if (data.session && data.user) {
      await saveProfileAndChild(data.user.id, name, email, childData)
    }

    return { error: null }
  }

  async function saveProfileAndChild(userId: string, name: string, email: string, childData?: { childName: string; childBirth: string; childGender: string; disability: string }) {
    const { error: pErr } = await supabase.from('profiles').upsert({
      id: userId,
      name,
      email,
    })
    if (pErr) console.error('profiles upsert error:', pErr)

    if (childData?.childName) {
      // 중복 방지: 이미 있는지 확인
      const { data: existing } = await supabase
        .from('children')
        .select('id')
        .eq('parent_id', userId)
        .limit(1)

      if (!existing || existing.length === 0) {
        const { error: cErr } = await supabase.from('children').insert({
          parent_id: userId,
          name: childData.childName,
          birth_date: childData.childBirth || null,
          gender: childData.childGender || null,
          disability: childData.disability || null,
        })
        if (cErr) console.error('children insert error:', cErr)
      }
    }
  }

  async function signIn(email: string, password: string) {
    clearHomeCache()
    clearDictCache()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }

    // 첫 로그인 시 metadata에서 테이블로 저장 (이메일 확인 켜진 경우 대비)
    if (data.user) {
      const meta = data.user.user_metadata
      if (meta?.name) {
        await saveProfileAndChild(data.user.id, meta.name, email, {
          childName: meta.child_name || '',
          childBirth: meta.child_birth || '',
          childGender: meta.child_gender || '',
          disability: meta.disability || '',
        })
      }
    }

    return { error: null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    clearHomeCache()
    clearDictCache()
    setChildCharacter('')
    setChildBirthDate('')
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
