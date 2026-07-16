import MockupFrame from './MockupFrame';

const lines = [
  'w-11/12 bg-paper-card',
  'w-3/4 bg-paper-card',
  'w-full border border-red-200 bg-red-100',
  'w-5/6 border border-green-300 bg-green-100',
  'w-2/3 border border-green-300 bg-green-100',
  'w-4/5 bg-paper-card',
  'w-1/2 bg-paper-card',
  'w-10/12 bg-paper-card',
  'w-3/5 border border-red-200 bg-red-100',
  'w-4/5 border border-green-300 bg-green-100',
  'w-2/3 bg-paper-card',
  'w-1/3 bg-paper-card',
];

export default function BuildMockup() {
  return (
    <MockupFrame>
      <div className="flex flex-1 flex-col justify-center">
        <p className="mb-4 font-mono text-sm text-ink-tertiary">src/pages/Login.tsx</p>
        <div className="flex flex-col gap-2.5">
          {lines.map((classes, i) => (
            <div key={i} className={`h-4 rounded ${classes}`} />
          ))}
        </div>
        <div className="mt-8 flex items-center gap-4">
          <span className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-white">
            Accept
          </span>
          <span className="rounded-full border border-ink/20 px-6 py-2.5 text-sm font-semibold text-ink-secondary">
            Reject
          </span>
          <span className="ml-auto text-sm text-ink-tertiary">2 of 3 changes</span>
        </div>
      </div>
    </MockupFrame>
  );
}
