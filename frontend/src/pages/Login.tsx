import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import './Login.css'

const STEPS = [
  { label: 'Step 1', desc: '가입정보 등록', icon: '/svg/step1.png' },
  { label: 'Step 2', desc: '아이정보 등록', icon: '/svg/step2.png' },
  { label: 'Step 3', desc: '회원가입 완료', icon: '/svg/step3.png' },
]

function AutoRedirect() {
  const navigate = useNavigate()
  useEffect(() => {
    const timer = setTimeout(() => navigate('/'), 3000)
    return () => clearTimeout(timer)
  }, [navigate])
  return null
}

export default function Login() {
  const navigate = useNavigate()
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [step, setStep] = useState(1)

  // Step 1 fields
  const [name, setName] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [birthMonth, setBirthMonth] = useState('')
  const [birthDay, setBirthDay] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [phone, setPhone] = useState('')
  const [phone2, setPhone2] = useState('')
  const [phone3, setPhone3] = useState('')
  const [carrier, setCarrier] = useState('LG U+')
  const [emailId, setEmailId] = useState('')
  const [emailDomain, setEmailDomain] = useState('gmail.com')

  // Step 2 fields
  const [childName, setChildName] = useState('')
  const [childBirth, setChildBirth] = useState('')
  const [childGender, setChildGender] = useState('')
  const [disability, setDisability] = useState('')

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // 로그인 fields
  const [loginId, setLoginId] = useState('')
  const [loginDomain, setLoginDomain] = useState('gmail.com')
  const [loginPassword, setLoginPassword] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const loginEmail = `${loginId}@${loginDomain}`
    const { error } = await signIn(loginEmail, loginPassword)
    if (error) setError(error)
    else navigate('/')
    setLoading(false)
  }

  async function handleNextStep() {
    if (step === 1) {
      if (!name || !emailId || !password) return setError('필수 항목을 입력하세요.')
      if (password !== passwordConfirm) return setError('비밀번호가 일치하지 않습니다.')
      setEmail(`${emailId}@${emailDomain}`)
      setError('')
      setStep(2)
    } else if (step === 2) {
      setError('')
      setLoading(true)
      const fullEmail = `${emailId}@${emailDomain}`
      const { error } = await signUp(fullEmail, password, name, {
        childName,
        childBirth,
        childGender,
        disability,
      })
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
          <img src="/svg/logo.png" alt="on-kid" className="login-logo" />
        </div>
        <div className="login-body">
          <div className="login-card">
            <img src="/svg/login-onkid.png" alt="on-kid" className="login-hero-logo" />
            <p className="login-slogan">눈으로 듣고 마음으로 배우는 진짜 교육!<br/>차별은 빼고, 배움은 더했습니다!</p>

            <form onSubmit={handleLogin} className="login-form">
              <div className="login-id-row">
                <input type="text" placeholder="아이디" value={loginId} onChange={e => setLoginId(e.target.value)} className="login-input login-id-input" required />
                <span className="signup-at">@</span>
                <select className="login-input login-domain-select" value={loginDomain} onChange={e => setLoginDomain(e.target.value)}>
                  <option>gmail.com</option>
                  <option>naver.com</option>
                  <option>daum.net</option>
                  <option>hanmail.net</option>
                </select>
              </div>
              <input type="password" placeholder="비밀번호" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} className="login-input login-input-full" required />
              <div className="login-remember">
                <label><input type="checkbox" /> 로그인 유지</label>
              </div>
              {error && <p className="login-error">{error}</p>}
              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? '로그인 중...' : '로그인 하기'}
              </button>
            </form>

            <div className="login-links">
              <span>아이디 찾기</span>
              <span className="login-divider">|</span>
              <span>비밀번호 찾기</span>
            </div>
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
        <img src="/svg/logo.png" alt="on-kid" className="login-logo" />
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
              <div className="signup-phone-row">
                <select className="signup-input signup-select signup-birth" value={birthYear} onChange={e => setBirthYear(e.target.value)}>
                  <option value="">년</option>
                  {Array.from({ length: 60 }, (_, i) => 2025 - i).map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <select className="signup-input signup-select signup-birth" value={birthMonth} onChange={e => setBirthMonth(e.target.value)}>
                  <option value="">월</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select className="signup-input signup-select signup-birth" value={birthDay} onChange={e => setBirthDay(e.target.value)}>
                  <option value="">일</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div className="signup-field">
              <span className="signup-label">아이디</span>
              <input type="text" placeholder="아이디를 입력하세요." value={emailId} onChange={e => setEmailId(e.target.value)} className="signup-input" />
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
              <div className="signup-phone-row">
                <select className="signup-input signup-select signup-phone-carrier" value={carrier} onChange={e => setCarrier(e.target.value)}>
                  <option>LG U+</option>
                  <option>SKT</option>
                  <option>KT</option>
                </select>
              </div>
            </div>
            <div className="signup-field">
              <span className="signup-label"></span>
              <div className="signup-phone-row">
                <select className="signup-input signup-select signup-phone-prefix" value={phone} onChange={e => setPhone(e.target.value)}>
                  <option>010</option>
                  <option>011</option>
                  <option>016</option>
                </select>
                <span className="signup-dash">-</span>
                <input type="text" maxLength={4} value={phone2} onChange={e => setPhone2(e.target.value)} className="signup-input signup-phone-num" />
                <span className="signup-dash">-</span>
                <input type="text" maxLength={4} value={phone3} onChange={e => setPhone3(e.target.value)} className="signup-input signup-phone-num" />
              </div>
            </div>
            <div className="signup-field">
              <span className="signup-label">이메일</span>
              <div className="signup-email-row">
                <input type="text" value={emailId} onChange={e => setEmailId(e.target.value)} className="signup-input signup-email-id" />
                <span className="signup-at">@</span>
                <select className="signup-input signup-select signup-email-domain" value={emailDomain} onChange={e => setEmailDomain(e.target.value)}>
                  <option>gmail.com</option>
                  <option>naver.com</option>
                  <option>daum.net</option>
                  <option>hanmail.net</option>
                </select>
              </div>
            </div>
            {error && <p className="login-error">{error}</p>}
            <button className="signup-next-btn" onClick={handleNextStep}>다음단계로</button>
          </div>
        )}

        {/* Step 2: 아이정보 */}
        {step === 2 && (
          <div className="signup-form">
            <div className="signup-field">
              <span className="signup-label">이름</span>
              <input type="text" placeholder="아이의 이름을 입력하세요." value={childName} onChange={e => setChildName(e.target.value)} className="signup-input" />
            </div>
            <div className="signup-field">
              <span className="signup-label">생년월일</span>
              <div className="signup-phone-row">
                <select className="signup-input signup-select signup-birth" value={childBirth.split('-')[0] || ''} onChange={e => setChildBirth(`${e.target.value}-${childBirth.split('-')[1] || ''}-${childBirth.split('-')[2] || ''}`)}>
                  <option value="">년</option>
                  {Array.from({ length: 20 }, (_, i) => 2025 - i).map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <select className="signup-input signup-select signup-birth" value={childBirth.split('-')[1] || ''} onChange={e => setChildBirth(`${childBirth.split('-')[0] || ''}-${e.target.value}-${childBirth.split('-')[2] || ''}`)}>
                  <option value="">월</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select className="signup-input signup-select signup-birth" value={childBirth.split('-')[2] || ''} onChange={e => setChildBirth(`${childBirth.split('-')[0] || ''}-${childBirth.split('-')[1] || ''}-${e.target.value}`)}>
                  <option value="">일</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div className="signup-field">
              <span className="signup-label">선호 동화</span>
              <select className="signup-input signup-select" defaultValue="">
                <option value="" disabled>장르를 선택해 주세요.</option>
                <option value="korean">한국전래동화</option>
                <option value="foreign">외국전래동화</option>
                <option value="creative">창작동화</option>
                <option value="kpicture">K-그림책</option>
              </select>
            </div>
            <div className="signup-field">
              <span className="signup-label">성별</span>
              <div className="signup-gender">
                <button className={`gender-btn ${childGender === '여' ? 'active' : ''}`} onClick={() => setChildGender('여')}>여자아이</button>
                <button className={`gender-btn ${childGender === '남' ? 'active' : ''}`} onClick={() => setChildGender('남')}>남자아이</button>
              </div>
            </div>

            {/* 아이 유형 선택 카드 */}
            <div className="signup-child-types">
              {[
                { id: 'slow', label: '학습이\n느린아이', img: '/svg/문해력.png' },
                { id: 'study', label: '공부가\n필요한 아이', img: '/svg/공부가필요한.png' },
                { id: 'hearing', label: '귀가\n불편한 아이', img: '/svg/귀가불편한.png' },
                { id: 'vision', label: '눈이\n불편한 아이', img: '/svg/눈이불편한.png' },
              ].map(type => (
                <div
                  key={type.id}
                  className={`child-type-card ${disability === type.id ? 'selected' : ''}`}
                  onClick={() => setDisability(disability === type.id ? '' : type.id)}
                >
                  <img src={type.img} alt={type.label} className="child-type-img" />
                  <span className="child-type-label">{type.label}</span>
                </div>
              ))}
            </div>

            {error && <p className="login-error">{error}</p>}
            <div className="signup-btn-row">
              <button className="signup-prev-btn" onClick={() => setStep(1)}>이전</button>
              <button className="signup-next-btn" onClick={handleNextStep} disabled={loading}>
                {loading ? '가입 중...' : '다음단계로'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: 완료 */}
        {step === 3 && (
          <div className="signup-complete">
            <img src="/svg/signup_complete.png" alt="회원가입 완료 캐릭터" className="signup-complete-characters" />
            <img src="/svg/signup_complete2.png" alt="회원가입 완료" className="signup-complete-message" />
            <AutoRedirect />
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
