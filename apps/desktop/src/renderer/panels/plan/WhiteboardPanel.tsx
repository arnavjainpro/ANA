import { useConversationStore } from '../../store/conversationStore';

/** Structured planning canvas: user stories, acceptance criteria, task list. */
export function WhiteboardPanel(): JSX.Element {
  const whiteboard = useConversationStore((s) => s.whiteboard);

  if (!whiteboard || whiteboard.stories.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-ana-border px-4 py-2 text-sm font-medium text-gray-300">
          Plan
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-sm text-gray-500">
            Describe a feature and Ana will build a plan here.
          </p>
        </div>
      </div>
    );
  }

  const criteriaFor = (storyId: string): string[] =>
    whiteboard.criteria.find((c) => c.storyId === storyId)?.items ?? [];
  const tasksFor = (storyId: string) =>
    whiteboard.tasks.filter((t) => t.storyId === storyId);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ana-border px-4 py-2 text-sm font-medium text-gray-300">
        Plan
      </div>
      <div className="flex-1 space-y-4 overflow-auto p-4">
        {whiteboard.stories.map((story) => (
          <section key={story.id} className="rounded-lg border border-ana-border bg-ana-panel p-4">
            <h3 className="text-sm font-semibold text-ana-accent">{story.id}</h3>
            <p className="mt-1 text-sm text-gray-200">
              As <span className="font-medium">{story.as}</span>, I want{' '}
              <span className="font-medium">{story.want}</span>, so that {story.so}.
            </p>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Acceptance criteria
                </h4>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-300">
                  {criteriaFor(story.id).map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Tasks
                </h4>
                <ul className="mt-1 space-y-1.5 text-sm text-gray-300">
                  {tasksFor(story.id).map((task) => (
                    <li key={task.id} className="rounded border border-ana-border/60 px-2 py-1">
                      <span className="font-medium text-gray-100">{task.title}</span>
                      <span className="block text-xs text-gray-400">{task.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
