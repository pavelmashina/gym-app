import { useEffect, useState } from 'react';
import { HomeScreen } from './components/HomeScreen.jsx';

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <HomeScreen
      menuOpen={menuOpen}
      onOpenMenu={() => setMenuOpen(true)}
      onCloseMenu={() => setMenuOpen(false)}
    />
  );
}
