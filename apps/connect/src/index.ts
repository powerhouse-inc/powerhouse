import { createRoot } from 'react-dom/client';
import { AppLoader } from './components/app-loader.js';

function renderApp(element: HTMLElement) {
    createRoot(element).render(AppLoader);
}

const AppElement = document.getElementById('app');
if (!AppElement) {
    throw new Error('#app element not found!');
}

renderApp(AppElement);
