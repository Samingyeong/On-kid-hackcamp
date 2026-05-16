import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import './Login.css'

export default function Login() {
  const navigate = useNavigate()
  const { signIn, signUp } = useAuth()
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (isSignUp) {
      const { error } = await signUp(email, password, name)
      if (error) setError(error)
      else navigate('/')
    } else {
      const { error } = await signIn(email, password)
      if (error) setError(error)
      else navigate('/')
    }
    setLoading(false)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">모두의 동화</h1>
        <p className="login-subtitle">{isSignUp ? '회원가입' : '로그인'}</p>

        <form onSubmit={handleSubmit} className="login-form">
          {isSignUp && (
            <input
              type="text"
              placeholder="이름"
              value={name}
              onChange={e => setName(e.target.value)}
              className="login-input"
              required
            />
          )}
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="login-input"
            required
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="login-input"
            required
            minLength={6}
          />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? '처리 중...' : isSignUp ? '가입하기' : '로그인'}
          </button>
        </form>

        <button className="login-toggle" onClick={() => { setIsSignUp(!isSignUp); setError('') }}>
          {isSignUp ? '이미 계정이 있어요' : '계정 만들기'}
        </button>
      </div>
    </div>
  )
}
