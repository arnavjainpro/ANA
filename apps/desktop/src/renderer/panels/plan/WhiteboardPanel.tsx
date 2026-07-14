import { useState } from 'react';
import { ChevronRight, Check, ClipboardList, ListTodo } from 'lucide-react';
import { useConversationStore } from '../../store/conversationStore';
import { FadeIn } from '../../components/FadeIn';
import { EmptyState, PanelHeader } from '../../components/ui';

/** Interactive planning canvas: user stories, acceptance criteria, task list. */
export function WhiteboardPanel(): JSX.Element {
  const whiteboard = useConversationStore((s) => s.whiteboard);
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());

  if (!whiteboard || whiteboard.stories.length === 0) {
    return (
      <FadeIn className="flex h-full flex-col bg-surface-base">
        <PanelHeader title="Plan" subtitle="User stories & implementation tasks" />
        <EmptyState
          icon={<ClipboardList size={20} strokeWidth={1.75} aria-hidden />}
          title="No plan yet"
          description="Describe a feature and Ana will build a plan here."
        />
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
    <FadeIn className="flex h-full flex-col bg-surface-base">
      <PanelHeader title="Plan" subtitle="User stories & implementation tasks" />

      {/* Content: Stories */}
      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-col gap-3">
          {whiteboard.stories.map((story) => {
            const isExpanded = expandedStories.has(story.id);
            const criteria = criteriaFor(story.id);
            const tasks = tasksFor(story.id);

            return (
              <div
                key={story.id}
                className="overflow-hidden rounded-lg border border-surface-border bg-surface-overlay shadow-raised"
              >
                {/* Story Header */}
                <button
                  type="button"
                  onClick={() => toggleStory(story.id)}
                  aria-expanded={isExpanded}
                  className="w-full cursor-pointer px-4 py-3 text-left transition-colors duration-150 hover:bg-surface-hover"
                >
                  <div className="flex items-start gap-3">
                    <ChevronRight
                      size={16}
                      strokeWidth={1.75}
                      aria-hidden
                      className={`mt-1 flex-shrink-0 text-text-tertiary transition-transform duration-150 ${
                        isExpanded ? 'rotate-90' : ''
                      }`}
                    />
                    <div className="flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="inline-block rounded-md bg-accent-muted px-2 py-0.5 text-xs font-semibold text-accent-primary ring-1 ring-inset ring-accent-border">
                          {story.id}
                        </span>
                        <span className="text-xs text-text-secondary">As {story.as}</span>
                      </div>
                      <p className="text-sm text-text-primary">
                        I want <span className="font-semibold">{story.want}</span> so that {story.so}
                      </p>
                    </div>
                  </div>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="flex flex-col gap-4 border-t border-surface-border px-4 py-4">
                    {/* Acceptance Criteria */}
                    {criteria.length > 0 && (
                      <div>
                        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                          <Check size={12} strokeWidth={2.5} aria-hidden className="text-accent-primary" />
                          Acceptance Criteria
                        </h4>
                        <ul className="flex flex-col gap-1">
                          {criteria.map((item, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-text-primary">
                              <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-accent-primary" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Tasks */}
                    {tasks.length > 0 && (
                      <div>
                        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                          <ListTodo size={12} strokeWidth={2} aria-hidden className="text-accent-primary" />
                          Implementation Tasks
                        </h4>
                        <div className="flex flex-col gap-1.5">
                          {tasks.map((task) => (
                            <div
                              key={task.id}
                              className="rounded-md border border-surface-border bg-surface-raised p-2.5 transition-colors duration-150 hover:bg-surface-hover"
                            >
                              <div className="flex items-start gap-2">
                                <input
                                  type="checkbox"
                                  className="mt-0.5 h-3.5 w-3.5 rounded border-surface-border accent-accent-primary"
                                  disabled
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-text-primary">
                                    {task.title}
                                  </p>
                                  <p className="mt-0.5 text-xs text-text-secondary">
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
