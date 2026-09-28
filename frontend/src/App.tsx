import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'
import Home from './pages/Home'
import Login from './pages/Login'
import Scan from './pages/Scan'
import Propose from './pages/Propose'
import Confirm from './pages/Confirm'
import Library from './pages/Library'
import EditionDetail from './pages/EditionDetail'
import Readings from './pages/Readings'
import AuthorPage from './pages/AuthorPage'
import Authors from './pages/Authors'
import WorkPage from './pages/WorkPage'
import { Icon } from './utils/icons'
import './index.css'

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const isHome = location.pathname === '/'

  const goBack = () => {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/')
  }

  return (
    <div className="app">
      {!isHome && (
        <button type="button" className="back-button" onClick={goBack} aria-label="Indietro" title="Indietro">
          <Icon name="back" size={22} />
        </button>
      )}
      <nav className="bottom-nav" aria-label="Navigazione principale">
        <Link to="/" aria-label="Home" title="Home"><Icon name="home" size={22} /></Link>
        <Link to="/scan" aria-label="Scansione" title="Scansione"><Icon name="more" size={24} /></Link>
        <Link to="/authors" aria-label="Autori" title="Autori"><Icon name="authors" size={22} /></Link>
        <Link to="/readings" aria-label="Letture" title="Letture"><Icon name="addReading" size={22} /></Link>
        <Link to="/library" aria-label="Libreria" title="Libreria"><Icon name="library" size={22} /></Link>
        <Link to="/login" aria-label="Login" title="Login"><Icon name="login" size={22} /></Link>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/propose/:jobId" element={<Propose />} />
          <Route path="/confirm/:jobId" element={<Confirm />} />
          <Route path="/editions/:editionId" element={<EditionDetail />} />
          <Route path="/works/:workId" element={<WorkPage />} />
          <Route path="/readings" element={<Readings />} />
          <Route path="/library" element={<Library />} />
          <Route path="/authors" element={<Authors />} />
          <Route path="/authors/:authorId" element={<AuthorPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
