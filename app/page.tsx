import Link from 'next/link';
import StartControls from '@/components/StartControls';
import UserMenu from '@/components/UserMenu';
import { currentUserId } from '@/lib/auth';
import { DOMAINS } from '@/lib/domains';
import { findUserById } from '@/lib/users';

export const dynamic = 'force-dynamic';

const STEPS = [
  {
    title: 'Pick your mode',
    body: 'Run a full 60-question mock against the clock, or drill a single domain at your own pace.',
  },
  {
    title: 'Answer in context',
    body: 'Questions arrive in scenario blocks of 4–6, each anchored to a realistic production situation.',
  },
  {
    title: 'Learn from every option',
    body: 'Get an immediate verdict, then an explanation of all four options — right and wrong.',
  },
];

const BADGES = ['Powered by Claude', 'Bring your own API key', 'Scenario-anchored', 'Open source'];

export default async function HomePage() {
  const uid = await currentUserId();
  const user = uid ? await findUserById(uid) : null;

  return (
    <>
      <nav className="site-nav">
        <div className="site-nav-inner">
          <a className="brand" href="/">
            <span className="brand-mark">CCA</span>
            CCA Exam Simulator
          </a>
          <div className="nav-links">
            <a href="#domains">Domains</a>
            <a href="#how">How it works</a>
            {user ? (
              <UserMenu username={user.username} />
            ) : (
              <>
                <Link href="/login">Log in</Link>
                <Link href="/register" className="btn">
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="container">
        <header className="hero">
          <span className="pill-tag">CCA Foundations · practice simulator</span>
          <h1 className="serif hero-title">
            Pass the Claude Certified
            <br />
            Architect exam.
          </h1>
          <p className="hero-lead">
            Maximum-difficulty, scenario-anchored practice for the{' '}
            <strong>Claude Certified Architect (CCA) Foundations</strong> exam. Every question is
            generated live by Claude inside a realistic production context — then explained option
            by option.
          </p>
          <div className="hero-actions">
            <a href="#start" className="btn">
              Start practicing
            </a>
            <a href="#how" className="btn btn-secondary">
              How it works
            </a>
          </div>
          <div className="badge-row">
            {BADGES.map((b) => (
              <span className="badge" key={b}>
                {b}
              </span>
            ))}
          </div>
        </header>

        <section className="stat-strip">
          <div className="stat">
            <span className="stat-num">60</span>
            <span className="stat-label">questions per mock</span>
          </div>
          <div className="stat">
            <span className="stat-num">120</span>
            <span className="stat-label">minute time limit</span>
          </div>
          <div className="stat">
            <span className="stat-num">5</span>
            <span className="stat-label">exam domains</span>
          </div>
          <div className="stat">
            <span className="stat-num">~720</span>
            <span className="stat-label">pass mark / 1,000</span>
          </div>
        </section>

        <section className="card">
          <h2 className="serif">What the exam looks like</h2>
          <p>
            60 multiple-choice questions in 120 minutes, scored on a 100–1,000 scale with a pass
            mark around 720. It is not a documentation quiz: questions hang off production scenarios
            and ask for the correct architectural call, where the strongest distractor is usually a
            genuinely defensible choice that loses on a single criterion.
          </p>
        </section>

        <section id="how">
          <h2 className="serif section-heading">How it works</h2>
          <div className="steps-grid">
            {STEPS.map((step, i) => (
              <div className="step-card" key={step.title}>
                <span className="step-num">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="serif">{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="domains" className="card">
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

        <section id="start">
          <h2 className="serif section-heading">Start practicing</h2>
          {user ? (
            <>
              <p className="muted start-resume-note">
                Logged in as <strong>{user.username}</strong>. Your exams are saved —{' '}
                <Link href="/profile">resume them or see your stats</Link>.
              </p>
              <StartControls />
            </>
          ) : (
            <div className="card start-card">
              <h3 className="serif">Create a free local account</h3>
              <p className="muted">
                Sign up to start exams, save your progress, resume sessions later, and get an
                AI-powered breakdown of your performance.
              </p>
              <div className="hero-actions">
                <Link href="/register" className="btn">
                  Sign up
                </Link>
                <Link href="/login" className="btn btn-secondary">
                  Log in
                </Link>
              </div>
            </div>
          )}
        </section>

        <footer className="page-footer">
          <div className="footer-top">
            <div className="footer-brand">
              <a className="brand" href="/">
                <span className="brand-mark">CCA</span>
                CCA Exam Simulator
              </a>
              <p>Live, scenario-based practice for the CCA Foundations exam.</p>
            </div>
            <div className="footer-cols">
              <div className="footer-col">
                <h4>Practice</h4>
                <ul>
                  <li>
                    <a href="#start">Full mock</a>
                  </li>
                  <li>
                    <a href="#domains">Single domain</a>
                  </li>
                  <li>
                    <a href="#how">How it works</a>
                  </li>
                </ul>
              </div>
              <div className="footer-col">
                <h4>Resources</h4>
                <ul>
                  <li>
                    <a href="https://www.anthropic.com" target="_blank" rel="noopener noreferrer">
                      Anthropic
                    </a>
                  </li>
                  <li>
                    <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer">
                      API Console
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <p className="muted small">
            Original approximations of the exam’s published <em>format</em> — not leaked content.
            Verify the current format on Anthropic’s official certification pages.
          </p>
        </footer>
      </main>
    </>
  );
}
