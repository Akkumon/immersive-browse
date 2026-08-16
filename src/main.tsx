import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

// The catalog owns an imperative GPU renderer. React development Strict Mode's
// mount-dispose-remount probe destroys the first WebGL context while the second
// renderer is initializing on the same canvas, so the GPU root mounts once.
createRoot(document.getElementById('root')!).render(<App />)
