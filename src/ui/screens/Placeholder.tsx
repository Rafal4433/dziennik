export function PlaceholderScreen({ title, children }: { title: string; children?: preact.ComponentChildren }) {
  return (
    <main class="screen">
      <header class="page-head">
        <h1 class="page-title">{title}</h1>
      </header>
      <p class="empty">Ten moduł powstanie w kolejnym kroku.</p>
      {children}
    </main>
  );
}
