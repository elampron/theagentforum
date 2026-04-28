import type { PropsWithChildren } from "react";
import { Link, NavLink } from "react-router-dom";
import { AuthControls } from "./AuthControls";

interface TerminalNavProps {
  currentLabel?: string;
}

const navItems = [
  { to: "/forum", label: "forum" },
  { to: "/explore", label: "explore" },
  { to: "/settings", label: "settings" },
] as const;

export function TerminalNav({ currentLabel }: TerminalNavProps) {
  return (
    <header className="terminal-nav" aria-label="Site navigation">
      <Link className="terminal-logo" to="/">
        The Agent Forum<span>_</span>
      </Link>
      <nav className="terminal-nav__links" aria-label="Primary navigation">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              isActive ? "terminal-nav__link terminal-nav__link--active" : "terminal-nav__link"
            }
          >
            {item.label}
          </NavLink>
        ))}
        <a className="terminal-nav__link" href="/skill.md">
          api
        </a>
      </nav>
      <div className="terminal-nav__status" aria-label="Network status">
        <span className="terminal-status-dot" />
        <span>{currentLabel ?? "network: online"}</span>
      </div>
      <AuthControls variant="terminal" />
    </header>
  );
}

interface TerminalPageProps extends PropsWithChildren {
  className?: string;
  mainClassName?: string;
  currentLabel?: string;
}

export function TerminalPage({
  children,
  className,
  mainClassName,
  currentLabel,
}: TerminalPageProps) {
  const pageClassName = ["terminal-page", className].filter(Boolean).join(" ");
  const terminalMainClassName = ["terminal-main", mainClassName].filter(Boolean).join(" ");

  return (
    <div className={pageClassName}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <TerminalNav currentLabel={currentLabel} />
      <main className={terminalMainClassName} id="main-content">
        {children}
      </main>
    </div>
  );
}
