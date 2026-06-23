import { useState } from 'react';
import { useConversationStore } from '../../store/conversationStore';
import { FadeIn } from '../../components/FadeIn';

/** Interactive planning canvas: user stories, acceptance criteria, task list. */
export function WhiteboardPanel(): JSX.Element {
  const whiteboard = useConversationStore((s) => s.whiteboard);
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());

  if (!whiteboard || whiteboard.stories.length === 0) {
    return (
      <FadeIn className="flex h-full flex-col bg-ana-bg">
        <div className="border-b border-ana-border px-6 py-4">
          <h2 tabIndex={-1} className="text-lg font-semibold text-ana-text">Plan</h2>
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-sm text-ana-text-muted">
            Describe a feature and Ana will build a plan here.
          </p>
        </div>
      </FadeIn>
    );
  }

  const criteriaFor = (storyId: string): string[] =>
    whiteboard.criteria.find((c) => c.storyId === storyId)?.items ?? [];
  const tasksFor = (storyId: string) =>
    whiteboard.tasks.filter((t) => t.storyId === storyId);

  const toggleStory = (storyId: string) => {
    setExpandedStories((prev) => {
      const next = new Set(prev);
      if (next.has(storyId)) {
        next.delete(storyId);
      } else {
        next.add(storyId);
      }
      return next;
    });
  };

  return (
    <FadeIn className="flex h-full flex-col bg-ana-bg">
      {/* Header */}
      <div className="border-b border-ana-border px-6 py-4 bg-ana-panel">
        <h2 tabIndex={-1} className="text-lg font-semibold text-ana-text">Plan</h2>
        <p className="mt-1 text-xs text-ana-text-muted">User stories & implementation tasks</p>
      </div>

      {/* Content: Stories */}
      <div className="flex-1 overflow-auto">
        <div className="divide-y divide-ana-border">
          {whiteboard.stories.map((story) => {
            const isExpanded = expandedStories.has(story.id);
            const criteria = criteriaFor(story.id);
            const tasks = tasksFor(story.id);

            return (
              <div key={story.id} className="border-b border-ana-border">
                {/* Story Header */}
                <button
                  type="button"
                  onClick={() => toggleStory(story.id)}
                  aria-expanded={isExpanded}
                  className="w-full px-6 py-4 text-left hover:bg-ana-hover transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="pt-1">
                      <svg
                        aria-hidden="true"
                        className={`w-4 h-4 text-ana-text-muted transition-transform ${
                          isExpanded ? 'rotate-90' : ''
                        }`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="inline-block px-2 py-1 rounded text-xs font-semibold text-ana-bg bg-ana-accent">
                          {story.id}
                        </span>
                        <span className="text-xs text-ana-text-muted">As {story.as}</span>
                      </div>
                      <p className="text-sm text-ana-text">
                        I want <span className="font-semibold">{story.want}</span> so that {story.so}
                      </p>
                    </div>
                  </div>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-6 py-4 bg-ana-panel/50 space-y-4">
                    {/* Acceptance Criteria */}
                    {criteria.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-ana-text-muted mb-2">
                          ✓ Acceptance Criteria
                        </h4>
                        <ul className="space-y-1">
                          {criteria.map((item, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-ana-text">
                              <span className="text-ana-accent mt-0.5">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Tasks */}
                    {tasks.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-ana-text-muted mb-2">
                          → Implementation Tasks
                        </h4>
                        <div className="space-y-1.5">
                          {tasks.map((task) => (
                            <div
                              key={task.id}
                              className="p-2.5 rounded border border-ana-border bg-ana-bg hover:bg-ana-hover transition-colors"
                            >
                              <div className="flex items-start gap-2">
                                <input
                                  type="checkbox"
                                  className="mt-0.5 w-3.5 h-3.5 cursor-pointer rounded border-ana-border accent-ana-accent"
                                  disabled
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-ana-text truncate">
                                    {task.title}
                                  </p>
                                  <p className="text-xs text-ana-text-muted mt-0.5">
                                    {task.detail}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </FadeIn>
  );
}
