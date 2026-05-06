import './App.css'
import Home from './pages/Home/index.jsx'
import Mirai_chat from './pages/Mirai_chat/Mirai_chat.jsx'
import About from './pages/About/About.jsx'
import MusicGameIndex from './pages/MusicGame/Index.jsx'
import { Routes, Route, useNavigate } from 'react-router-dom'

function App() {
  const navigate = useNavigate()

  const handleClick = (navpage) => {
    const map = {
      0: '/',
      1: '/chat',
      2: '/about',
      3: '/music'
    }
    const path = map[navpage] || '/'
    navigate(path)
  }

  return (
    <>
      <section id="main">
        <div className="container">
          <div className="header">
            <h1 className="title">MirAI</h1>
            <div className="nav">
              <button onClick={() => handleClick(0)} className="nav-btn">Home</button>
              <button onClick={() => handleClick(1)} className="nav-btn">Chat</button>
              <button onClick={() => handleClick(2)} className="nav-btn">About</button>
              <button onClick={() => handleClick(3)} className="nav-btn">Music Game</button>
            </div>
          </div>
          <div className="layout">
            <Routes>
              <Route path="/" element={<Home onNavigate={(nextPage) => handleClick(nextPage)} />} />
              <Route path="/chat" element={<Mirai_chat />} />
              <Route path="/about" element={<About />} />
              <Route path="/music" element={<MusicGameIndex />} />
            </Routes>
          </div>
        </div>
      </section>
    </>
  )
}

export default App
