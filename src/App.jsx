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
      <section id="main">
        <div className="container">
          <div className="header">
            <h1 className="title">MirAI</h1>
            <nav className="nav" aria-label="Main">
              {NAV_ITEMS.map((item) => (
                <NavLink key={item.path} to={item.path} end className="nav-btn">
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="layout">
            <Suspense fallback={<div className="route-loading" role="status">Loading...</div>}>
              <Routes>
                <Route path="/" element={<Home onNavigate={handleNavigate} />} />
                <Route path="/chat" element={<Mirai_chat />} />
                <Route path="/about" element={<About />} />
                <Route path="/games" element={<MusicGameIndex />} />
              </Routes>
            </Suspense>
          </div>
        </div>
      </section>
    </>
  )
}

export default App
