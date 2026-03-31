import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import './App.css'
import Mirai_chat from './pages/Mirai_chat.jsx'
import About from './pages/About.jsx'

function App() {
  const [count, setCount] = useState(0)
  const page = {
    1: <Mirai_chat />,
    2: <About />
  }
  const [currentpage, setCurrentpage] = useState(1)

  const handleClick = (navpage) => {
    setCurrentpage(navpage)
    console.log(navpage)
  }
  return (
    <>
      <section id="main">
        <div className="container">
          <div className="header">
            <h1 className="title">MirAI</h1>
            <div className="nav">
              <button onClick={() => handleClick(1)} className="nav-btn">Chat</button>
              <button onClick={() => handleClick(2)} className="nav-btn">About</button>
            </div>
          </div>
          <div className="layout">
              {page[currentpage]}
            </div>
        </div>
      </section>

      <div className="ticks"></div>
      <section id="spacer"></section>
    </>
  )
}

export default App
