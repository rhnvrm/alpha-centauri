import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { createStore } from './game/store.js';
import './styles.css';

const store = createStore();
if (import.meta.env.DEV) window.__store = store; // dev/e2e hook; never part of gameplay
createRoot(document.getElementById('root')).render(<App store={store} />);
