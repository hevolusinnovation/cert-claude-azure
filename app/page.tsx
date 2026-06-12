import StartControls from '@/components/StartControls';
import { DOMAINS } from '@/lib/domains';

export default function HomePage() {
  return (
    <main className="container">
      <header className="hero">
        <span className="pill-tag">CCA Foundations · practice simulator</span>
        <h1 className="serif hero-title">CCA Exam Simulator</h1>
        <p className="hero-lead">
          Maximum-difficulty, scenario-anchored practice for the{' '}
          <strong>Claude Certified Architect (CCA) Foundations</strong> exam. Every question is
          generated live by Claude and placed inside a realistic production context — a broken agent
          loop, a poorly scoped tool schema, a degrading pipeline — then explained option by option.
        </p>
      </header>

      <section className="card">
        <h2 className="serif">What the exam looks like</h2>
        <p>
          60 multiple-choice questions in 120 minutes, scored on a 100–1,000 scale with a pass mark
          around 720. It is not a documentation quiz: questions hang off production scenarios and ask
          for the correct architectural call, where the strongest distractor is usually a genuinely
          defensible choice that loses on a single criterion.
        </p>
      </section>

      <section className="card">
        <h2 className="serif">The five domains</h2>
        <ul className="domain-list">
          {DOMAINS.map((d) => (
            <li key={d.code}>
              <div className="domain-list-head">
                <strong>
                  {d.code} — {d.name}
                </strong>
                <span className="muted small">{d.fullMockQuestions} in a full mock</span>
              </div>
              <p className="muted small">{d.blurb}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2 className="serif">How this simulator works</h2>
        <ul className="rules">
          <li>Questions arrive in scenario blocks of 4–6, each anchored to one named scenario.</li>
          <li>
            Pick an answer to get an immediate verdict, then an explanation of <em>all four</em>{' '}
            options.
          </li>
          <li>Your running score (overall and per domain) is always visible.</li>
          <li>The next block is prefetched while you answer, so there’s no waiting between blocks.</li>
          <li>Progress is saved in your browser — a refresh won’t lose your place.</li>
        </ul>
      </section>

      <section>
        <h2 className="serif section-heading">Start practicing</h2>
        <StartControls />
      </section>

      <footer className="page-footer">
        <p className="muted small">
          Original approximations of the exam’s published <em>format</em> — not leaked content.
          Verify the current format on Anthropic’s official certification pages.
        </p>
      </footer>
    </main>
  );
}
