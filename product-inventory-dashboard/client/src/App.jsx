import { useEffect, useState } from 'react';
import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:5001/api' });

export default function App() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState('');

  useEffect(() => {
    api.get('/products').then(({ data }) => setItems(data)).catch(() => setItems([]));
  }, []);

  async function addItem(event) {
    event.preventDefault();
    if (!name.trim()) return;
    const { data } = await api.post('/products', { name });
    setItems([data, ...items]);
    setName('');
  }

  return <main className="app-shell">
    <header><span>product-inventory-dashboard</span><h1>Product Dashboard</h1></header>
    <form className="add-row" onSubmit={addItem}>
      <input placeholder="Add product" value={name} onChange={(event) => setName(event.target.value)} />
      <button>Add</button>
    </form>
    <section className="grid">{items.map((item) => <article key={item._id || item.id || item.name}>{item.name}</article>)}</section>
  </main>;
}
