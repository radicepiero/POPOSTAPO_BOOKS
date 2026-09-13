import { Link } from 'react-router-dom'

function Home() {
  return (
    <div>
      <h1>Popostapo Books</h1>
      <p>Cataloga i tuoi libri partendo dalla copia fisica.</p>
      <Link to="/scan" className="btn">Aggiungi un libro</Link>
    </div>
  )
}

export default Home
