'use client';

import type { Task } from '../../lib/api';
import { CaseSidebarItem, formatShortDate, humanize } from './TaskCardSupport';

export type TaskPanelKey = 'work' | 'customer' | 'conversation' | 'files' | 'outcome' | 'activity';

export interface TaskPanelItem {
  key: TaskPanelKey;
  label: string;
  detail: string;
}

interface TaskSectionNavigationProps {
  items: TaskPanelItem[];
  activePanel: TaskPanelKey;
  mode: 'mobile' | 'sidebar';
  onSelect: (panel: TaskPanelKey) => void;
}

export function TaskSectionNavigation({
  items,
  activePanel,
  mode,
  onSelect,
}: TaskSectionNavigationProps) {
  const mobile = mode === 'mobile';
  return (
    <nav
      className={
        mobile ? 'lg:hidden' : 'hidden rounded-lg border border-[#dfe6da] bg-white p-3 lg:block'
      }
      aria-label="Task sections"
    >
      {!mobile && (
        <div className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-[#344039]">
          Sections
        </div>
      )}
      <div className={mobile ? '-mx-1 flex gap-2 overflow-x-auto px-1 pb-1' : 'space-y-1'}>
        {items.map((item) => {
          const selected = activePanel === item.key;
          const selectedClasses = 'border-[#0f766e] bg-[#e8f5ef] text-[#0f4f43]';
          const idleClasses = mobile
            ? 'border-[#dfe6da] bg-white text-[#344039] hover:bg-[#f8faf6]'
            : 'border-transparent bg-white text-[#344039] hover:border-[#dfe6da] hover:bg-[#f8faf6]';
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(item.key)}
              className={`${mobile ? 'shrink-0' : 'w-full'} rounded-md border px-3 py-2 text-left transition ${selected ? selectedClasses : idleClasses}`}
              aria-current={selected ? 'page' : undefined}
            >
              <span className="block text-xs font-bold uppercase tracking-wider">{item.label}</span>
              <span className="mt-0.5 block text-[11px] text-slate-500">{item.detail}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

interface TaskCardSidebarProps {
  task: Task;
  assigneeName: string;
  messageCount: number;
  workflowStepCount: number;
  linkedNoticeCount: number;
  panelItems: TaskPanelItem[];
  activePanel: TaskPanelKey;
  onSelectPanel: (panel: TaskPanelKey) => void;
}

export function TaskCardSidebar({
  task,
  assigneeName,
  messageCount,
  workflowStepCount,
  linkedNoticeCount,
  panelItems,
  activePanel,
  onSelectPanel,
}: TaskCardSidebarProps) {
  return (
    <aside className="mt-5 space-y-3 lg:sticky lg:top-4 lg:mt-0">
      <TaskSectionNavigation
        items={panelItems}
        activePanel={activePanel}
        mode="sidebar"
        onSelect={onSelectPanel}
      />
      <div className="rounded-lg border border-[#dfe6da] bg-white p-4">
        <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[#344039]">
          At a glance
        </div>
        <div className="space-y-3 text-sm">
          <CaseSidebarItem
            label="Assignee"
            value={assigneeName}
            tone={task.assigneeId ? 'normal' : 'warning'}
          />
          <CaseSidebarItem
            label="Due"
            value={formatShortDate(task.dueAt)}
            tone={task.isOverdue ? 'danger' : task.isDueSoon ? 'warning' : 'normal'}
          />
          <CaseSidebarItem
            label="Waiting On"
            value={humanize(task.waitingOn || 'NONE')}
            tone={task.waitingOn && task.waitingOn !== 'NONE' ? 'warning' : 'normal'}
          />
          <CaseSidebarItem
            label="Priority"
            value={`${humanize(task.priority || 'normal')} priority`}
            tone={task.priority === 'high' ? 'danger' : 'normal'}
          />
          <CaseSidebarItem label="Messages" value={String(messageCount)} />
          <CaseSidebarItem label="Workflow Steps" value={String(workflowStepCount)} />
          {linkedNoticeCount > 0 && (
            <CaseSidebarItem label="Linked Notices" value={String(linkedNoticeCount)} />
          )}
        </div>
      </div>
    </aside>
  );
}
