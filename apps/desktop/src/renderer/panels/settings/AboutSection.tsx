const VERSION = '0.1.0';

/** App identity + version. */
export function AboutSection(): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-accent-primary" />
        <span className="text-lg font-semibold tracking-tight text-text-primary">Ana</span>
      </div>
      <p className="max-w-md text-sm leading-relaxed text-text-secondary">
        A voice-first AI coding partner for non-technical people — connect a repo, talk
        through it with Ana, and build alongside her in real time.
      </p>
      <p className="text-xs text-text-tertiary">Version {VERSION}</p>
    </div>
  );
}
