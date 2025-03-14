import { createRoot } from 'react-dom/client';

async function renderApp(element: HTMLElement) {
    const AppLoader = await import('./components/app-loader.js');
    createRoot(element).render(AppLoader.default);
}

const AppElement = document.getElementById('app');
if (!AppElement) {
    throw new Error('#app element not found!');
}

renderApp(AppElement).catch(console.error);
