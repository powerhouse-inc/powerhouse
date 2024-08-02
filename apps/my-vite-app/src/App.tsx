import { Button } from '@pgph/pkg-a';
import { Panel } from '@pgph/pkg-b';
import { concat } from '@pgph/pkg-c';
import './App.css';
import reactLogo from './assets/react.svg';
import viteLogo from '/vite.svg';

function App() {
    return (
        <>
            <div>
                <a href="https://vitejs.dev" target="_blank">
                    <img src={viteLogo} className="logo" alt="Vite logo" />
                </a>
                <a href="https://react.dev" target="_blank">
                    <img
                        src={reactLogo}
                        className="logo react"
                        alt="React logo"
                    />
                </a>
            </div>
            <h1>Vite + React</h1>

            <div>
                <Button onClick={() => console.log('pkg-a')} />
            </div>

            <div>
                <Panel />
            </div>

            <div>{concat('Hello', 'World >> C')}</div>
        </>
    );
}

export default App;
