import { lazy, Suspense, useEffect } from 'react'
import './App.css'
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'

const Home = lazy(() => import('./pages/Home/index.jsx'))
const Mirai_chat = lazy(() => import('./pages/Mirai_chat/Mirai_chat.jsx'))
const About = lazy(() => import('./pages/About/About.jsx'))
const MusicGameIndex = lazy(() => import('./pages/Game/MusicGame/Index.jsx'))

const ICONS = {
  '/': <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  '/chat': <path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4V5a1 1 0 0 1 1-1z" />,
  '/about': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
  '/games': (
    <>
      <path d="M9 18V6l11-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </>
  ),
}

const NAV_ITEMS = [
  { label: 'Trang chủ', path: '/' },
  { label: 'Trò chuyện', path: '/chat' },
  { label: 'Giới thiệu', path: '/about' },
  { label: 'Trò chơi', path: '/games' },
]

const PAGE_TITLES = {
  '/': 'MirAI - Bạn đồng hành ảo của bạn',
  '/chat': 'Trò chuyện với Mirai | MirAI',
  '/about': 'Giới thiệu | MirAI',
  '/games': 'Trò chơi | MirAI',
}

function App() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    document.title = PAGE_TITLES[pathname] ?? PAGE_TITLES['/']
  }, [pathname])

  const handleNavigate = (navpage) => {
    navigate(NAV_ITEMS[navpage]?.path ?? '/')
  }

  return (
    <>
      <div id="main">
        <a className="skip-link" href="#content">Bỏ qua tới nội dung</a>
        <div className={`container${pathname === '/chat' ? ' is-chat' : ''}`}>
          <header className="header">
            <NavLink to="/" end className="brand" aria-label="MirAI - Trang chủ">
              <img className="brand-logo" src="/Mirai_Logo.svg" alt="" width="34" height="34" />
              <span className="title">Mir<span className="title-ai">AI</span></span>
            </NavLink>
            <nav className="nav" aria-label="Điều hướng chính">
              {NAV_ITEMS.map((item) => (
                <NavLink key={item.path} to={item.path} end className="nav-btn">
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </header>
          <main className="layout" id="content" tabIndex={-1}>
            <Suspense fallback={<div className="route-loading" role="status">Đang tải…</div>}>
              <Routes>
                <Route path="/" element={<Home onNavigate={handleNavigate} />} />
                <Route path="/chat" element={<Mirai_chat />} />
                <Route path="/about" element={<About />} />
                <Route path="/games" element={<MusicGameIndex />} />
              </Routes>
            </Suspense>
          </main>
          <nav className="tabbar" aria-label="Điều hướng nhanh">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.path} to={item.path} end className="tab">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{ICONS[item.path]}</svg>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
    </>
  )
}

export default App
