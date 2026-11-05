import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installAgentApi } from './agent';
import './tokens.css';
import './styles.css';

installAgentApi();
createRoot(document.getElementById('root')!).render(<App />);
