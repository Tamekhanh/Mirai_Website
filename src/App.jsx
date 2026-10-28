import { lazy, Suspense, useEffect } from 'react'
import './App.css'
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'

const Home = lazy(() => import('./pages/Home/index.jsx'))
const Mirai_chat = lazy(() => import('./pages/Mirai_chat/Mirai_chat.jsx'))
const About = lazy(() => import('./pages/About/About.jsx'))
const MusicGameIndex = lazy(() => import('./pages/Game/MusicGame/Index.jsx'))

const NAV_ITEMS = [
  { label: 'Home', path: '/' },
  { label: 'Chat', path: '/chat' },
  { label: 'About', path: '/about' },
  { label: 'Games', path: '/games' },
]

const PAGE_TITLES = {
  '/': 'MirAI - Chat with your VRM companion',
  '/chat': 'Chat with Mirai | MirAI',
  '/about': 'About | MirAI',
  '/games': 'Games | MirAI',
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
        <a className="skip-link" href="#content">Skip to content</a>
        <div className="container">
          <header className="header">
            <div className="title">MirAI</div>
            <nav className="nav" aria-label="Main">
              {NAV_ITEMS.map((item) => (
                <NavLink key={item.path} to={item.path} end className="nav-btn">
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </header>
          <main className="layout" id="content" tabIndex={-1}>
            <Suspense fallback={<div className="route-loading" role="status">Loading...</div>}>
              <Routes>
                <Route path="/" element={<Home onNavigate={handleNavigate} />} />
                <Route path="/chat" element={<Mirai_chat />} />
                <Route path="/about" element={<About />} />
                <Route path="/games" element={<MusicGameIndex />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </div>
    </>
  )
}

export default App
