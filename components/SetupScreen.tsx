import Link from 'next/link';

export default function SetupScreen() {
  return (
    <main className="container">
      <div className="card setup">
        <span className="pill-tag">Setup needed</span>
        <h1 className="serif">Bring your own API key</h1>
        <p>
          This simulator generates every question live with Claude, so it needs an Anthropic API
          key. The repo ships without one — you provide your own, and it stays on the server.
        </p>

        <h2 className="serif">Local development</h2>
        <ol className="steps">
          <li>
            Create a key at{' '}
            <a href="https://console.anthropic.com" target="_blank" rel="noreferrer">
              console.anthropic.com
            </a>
            .
          </li>
          <li>
            Copy the example env file: <code>cp .env.example .env.local</code>
          </li>
          <li>
            Set the key in <code>.env.local</code>: <code>ANTHROPIC_API_KEY=sk-ant-...</code>
          </li>
          <li>
            Restart the dev server: <code>npm run dev</code>
          </li>
        </ol>

        <h2 className="serif">Deployed (Vercel, etc.)</h2>
        <p>
          Add <code>ANTHROPIC_API_KEY</code> as an environment variable in your hosting dashboard,
          then redeploy. Optionally set <code>ANTHROPIC_MODEL</code> to override the default model.
        </p>

        <p className="muted">
          Your key is read only in the server-side API route, never sent to the browser, never
          logged, and never committed.
        </p>

        <Link className="btn" href="/">
          Back to home
        </Link>
      </div>
    </main>
  );
}
