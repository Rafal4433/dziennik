import { render } from 'preact';
import './styles.css';
import { App } from './ui/App';
import { init, setPersistenceWarning } from './data/store';
import { openRepository } from './data/db';

openRepository()
  .then(async ({ repo, persistent }) => {
    await init(repo);
    if (!persistent) setPersistenceWarning();
    if (import.meta.env.VITE_PREVIEW) (await import('./preview')).seedPreview();
    // Prośba, by przeglądarka nie czyściła danych przy braku miejsca.
    navigator.storage?.persist?.().catch(() => {});
  })
  .then(() => render(<App />, document.getElementById('app')!));

if ('serviceWorker' in navigator && import.meta.env.PROD && !import.meta.env.VITE_NO_SW) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* bez service workera aplikacja działa dalej, tylko nie offline */
    });
  });
}
