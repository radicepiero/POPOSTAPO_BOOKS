import { Routes, Route, Link } from 'react-router-dom'
import Home from './pages/Home'
import Login from './pages/Login'
import Scan from './pages/Scan'
import Propose from './pages/Propose'
import Confirm from './pages/Confirm'
import Library from './pages/Library'
import EditionDetail from './pages/EditionDetail'
import Readings from './pages/Readings'
import './index.css'

function App() {
  return (
    <div className="app">
      <nav className="bottom-nav">
        <Link to="/">Home</Link>
        <Link to="/scan">+</Link>
        <Link to="/readings">Letture</Link>
        <Link to="/library">Libreria</Link>
        <Link to="/login">Login</Link>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/propose/:jobId" element={<Propose />} />
          <Route path="/confirm/:jobId" element={<Confirm />} />
          <Route path="/editions/:editionId" element={<EditionDetail />} />
          <Route path="/readings" element={<Readings />} />
          <Route path="/library" element={<Library />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
