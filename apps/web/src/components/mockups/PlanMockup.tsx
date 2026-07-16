import { Check } from 'lucide-react';
import MockupFrame from './MockupFrame';

const tasks = [
  { label: 'Create signup form', done: true },
  { label: 'Add password validation', done: true },
  { label: 'Send welcome email', done: false },
  { label: 'Write acceptance tests', done: false },
];

export default function PlanMockup() {
  return (
    <MockupFrame>
      <div className="flex flex-1 flex-col justify-center gap-5">
        <div className="rounded-2xl bg-accent-soft p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">User story</p>
          <p className="mt-2 text-base text-ink">
            As a visitor, I can create an account so I can save my projects.
          </p>
        </div>
        <div className="rounded-2xl bg-accent-soft p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">User story</p>
          <p className="mt-2 text-base text-ink">
            As a user, I get a confirmation email after signing up.
          </p>
        </div>
        <div className="rounded-2xl border border-paper-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Tasks</p>
          <ul className="mt-3 flex flex-col gap-3">
            {tasks.map((task) => (
              <li key={task.label} className="flex items-center gap-3 text-base">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-md border ${
                    task.done ? 'border-accent bg-accent text-white' : 'border-paper-card bg-paper-tint'
                  }`}
                >
                  {task.done ? <Check size={14} /> : null}
                </span>
                <span className={task.done ? 'text-ink-tertiary line-through' : 'text-ink-secondary'}>
                  {task.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </MockupFrame>
  );
}
