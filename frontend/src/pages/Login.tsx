import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import './Login.css'

const STEPS = [
  { label: 'Step 1', desc: '가입정보 등록', icon: '/svg/signup1.png' },
  { label: 'Step 2', desc: '아이정보 등록', icon: '/svg/signup2.png' },
  { label: 'Step 3', desc: '회원가입 완료', icon: '/svg/signup3.png' },
]

export default function Login() {
  const navigate = useNavigate()
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [step, setStep] = useState(1)

  // Step 1 fields
  const [name, setName] = useState('')
  const [birth, setBirth] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [phone, setPhone] = useState('')

  // Step 2 fields
  const [childName, setChildName] = useState('')
  const [childBirth, setChildBirth] = useState('')
  const [childGender, setChildGender] = useState('')
  const [disability, setDisability] = useState('')

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) setError(error)
    else navigate('/')
    setLoading(false)
  }

  async function handleNextStep() {
    if (step === 1) {
      if (!name || !email || !password) return setError('필수 항목을 입력하세요.')
      if (password !== passwordConfirm) return setError('비밀번호가 일치하지 않습니다.')
      setError('')
      setStep(2)
    } else if (step === 2) {
      setError('')
      setLoading(true)
      const { error } = await signUp(email, password, name)
      if (error) { setError(error); setLoading(false); return }
      setStep(3)
      setLoading(false)
    }
  }

  // 로그인 모드
  if (mode === 'login') {
    return (
      <div className="login-page">
        <div className="login-header">
          <img src="/svg/Union.png" alt="" className="login-deco login-deco-left" />
          <img src="/svg/Union-1.png" alt="" className="login-deco login-deco-right" />
        </div>
        <div className="login-body">
          <div className="login-card">
            <h1 className="login-title">on-kid</h1>
            <form onSubmit={handleLogin} className="login-form">
              <div className="login-field">
                <span className="login-label">이메일</span>
                <input type="email" placeholder="이메일을 입력하세요." value={email} onChange={e => setEmail(e.target.value)} className="login-input" required />
              </div>
              <div className="login-field">
                <span className="login-label">비밀번호</span>
                <input type="password" placeholder="비밀번호를 입력하세요." value={password} onChange={e => setPassword(e.target.value)} className="login-input" required />
              </div>
              {error && <p className="login-error">{error}</p>}
              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? '로그인 중...' : '로그인'}
              </button>
            </form>
            <button className="login-toggle" onClick={() => { setMode('signup'); setError('') }}>
              회원가입
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 회원가입 모드
  return (
    <div className="login-page">
      <div className="login-header">
        <img src="/svg/Union.png" alt="" className="login-deco login-deco-left" />
        <img src="/svg/Union-1.png" alt="" className="login-deco login-deco-right" />
      </div>
      <div className="login-body">
        {/* 스텝 표시 */}
        <div className="signup-steps">
          {STEPS.map((s, i) => (
            <div key={i} className={`signup-step ${i + 1 === step ? 'active' : ''} ${i + 1 < step ? 'done' : ''}`}>
              <div className="signup-step-icon">
                <img src={s.icon} alt="" />
              </div>
              <div className="signup-step-text">
                <span className="signup-step-label">{s.label}</span>
                <span className="signup-step-desc">{s.desc}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Step 1: 가입정보 */}
        {step === 1 && (
          <div className="signup-form">
            <div className="signup-field">
              <span className="signup-label">이름</span>
              <input type="text" placeholder="보호자의 이름을 입력하세요." value={name} onChange={e => setName(e.target.value)} className="signup-input" />
            </div>
            <div className="signup-field">
              <span className="signup-label">생년월일</span>
              <input type="text" placeholder="주민등록상 생년월일 8자리를 입력하세요." value={birth} onChange={e => setBirth(e.target.value)} className="signup-input" />
            </div>
            <div className="signup-field">
              <span className="signup-label">아이디</span>
              <input type="email" placeholder="이메일을 입력하세요." value={email} onChange={e => setEmail(e.target.value)} className="signup-input" />
            </div>
            <div className="signup-field">
              <span className="signup-label">비밀번호</span>
              <input type="password" placeholder="비밀번호를 입력하세요." value={password} onChange={e => setPassword(e.target.value)} className="signup-input" />
            </div>
            <div className="signup-field">
              <span className="signup-label">비밀번호 확인</span>
              <input type="password" placeholder="다시한번 비밀번호를 입력하세요." value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} className="signup-input" />
            </div>
            <div className="signup-field">
              <span className="signup-label">휴대폰 번호</span>
              <input type="tel" placeholder="010-0000-0000" value={phone} onChange={e => setPhone(e.target.value)} className="signup-input" />
            </div>
            {error && <p className="login-error">{error}</p>}
            <button className="signup-next-btn" onClick={handleNextStep}>다음단계로</button>
          </div>
        )}

        {/* Step 2: 아이정보 */}
        {step === 2 && (
          <div className="signup-form">
            <div className="signup-field">
              <span className="signup-label">아이 이름</span>
              <input type="text" placeholder="아이의 이름을 입력하세요." value={childName} onChange={e => setChildName(e.target.value)} className="signup-input" />
            </div>
            <div className="signup-field">
              <span className="signup-label">아이 생년월일</span>
              <input type="text" placeholder="생년월일 8자리를 입력하세요." value={childBirth} onChange={e => setChildBirth(e.target.value)} className="signup-input" />
            </div>
            <div className="signup-field">
              <span className="signup-label">성별</span>
              <div className="signup-gender">
                <button className={`gender-btn ${childGender === '남' ? 'active' : ''}`} onClick={() => setChildGender('남')}>남</button>
                <button className={`gender-btn ${childGender === '여' ? 'active' : ''}`} onClick={() => setChildGender('여')}>여</button>
              </div>
            </div>
            <div className="signup-field">
              <span className="signup-label">장애 유형</span>
              <input type="text" placeholder="해당 시 입력 (선택사항)" value={disability} onChange={e => setDisability(e.target.value)} className="signup-input" />
            </div>
            {error && <p className="login-error">{error}</p>}
            <div className="signup-btn-row">
              <button className="signup-prev-btn" onClick={() => setStep(1)}>이전</button>
              <button className="signup-next-btn" onClick={handleNextStep} disabled={loading}>
                {loading ? '가입 중...' : '가입완료'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: 완료 */}
        {step === 3 && (
          <div className="signup-complete">
            <h2>회원가입이 완료되었습니다!</h2>
            <p>모두의 동화에 오신 것을 환영합니다.</p>
            <button className="signup-next-btn" onClick={() => navigate('/')}>시작하기</button>
          </div>
        )}

        {mode === 'signup' && step === 1 && (
          <button className="login-toggle" onClick={() => { setMode('login'); setError('') }}>
            이미 계정이 있어요
          </button>
        )}
      </div>
    </div>
  )
}
