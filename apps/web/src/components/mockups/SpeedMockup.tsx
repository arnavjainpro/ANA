import MockupFrame from './MockupFrame';

const bars = [
  'h-4', 'h-8', 'h-14', 'h-10', 'h-16', 'h-11', 'h-20', 'h-12',
  'h-16', 'h-8', 'h-14', 'h-6', 'h-10', 'h-5', 'h-8',
];

export default function SpeedMockup() {
  return (
    <MockupFrame dark>
      <div className="flex flex-1 flex-col items-center justify-center gap-10">
        <div className="flex h-20 items-center gap-2" aria-hidden="true">
          {bars.map((height, i) => (
            <span key={i} className={`w-2 rounded-full bg-accent ${height}`} />
          ))}
        </div>
        <div className="rounded-full border border-accent/40 bg-accent/10 px-6 py-3 text-base font-semibold text-accent">
          &lt;1000ms end-to-end
        </div>
        <p className="text-center text-sm text-dark-textDim">
          You speak. Ana answers. No awkward pause.
        </p>
      </div>
    </MockupFrame>
  );
}
