import React, { useEffect, useRef } from 'react';
import { mentionTargets } from '../../../utils/chatCommands';

interface MentionPopupProps {
  filter: string;
  selectedIndex: number;
  onSelect: (mentionId: string) => void;
  visible: boolean;
}

export const MentionPopup: React.FC<MentionPopupProps> = ({
  filter,
  selectedIndex,
  onSelect,
  visible,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible && containerRef.current) {
      const selectedEl = containerRef.current.children[selectedIndex] as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, visible]);

  if (!visible) return null;

  const filteredMentions = mentionTargets.filter(m =>
    m.label.toLowerCase().includes(filter.toLowerCase())
  );

  if (filteredMentions.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-10 mb-2 w-64 bg-[var(--bg-0)] border border-[var(--border-1)] rounded-xl shadow-lg overflow-hidden flex flex-col py-1 z-50 max-h-60 overflow-y-auto custom-scrollbar"
    >
      {filteredMentions.map((mention, index) => {
        const Icon = mention.icon;
        return (
          <button
            key={mention.id}
            onClick={() => onSelect(mention.id)}
            className={`flex flex-col items-start px-3 py-2 text-left transition-colors ${
              index === selectedIndex
                ? 'bg-[var(--accent)]/10 bg-[var(--hover)]'
                : 'hover:bg-[var(--hover)]'
            }`}
          >
            <div className="flex items-center gap-2">
              <Icon size={14} className={index === selectedIndex ? 'text-[var(--accent)]' : 'text-[var(--text-2)]'} />
              <span className={`text-sm font-medium ${index === selectedIndex ? 'text-[var(--accent)]' : 'text-[var(--text-1)]'}`}>
                {mention.label}
              </span>
            </div>
            <span className="text-xs text-[var(--text-3)] mt-0.5 ml-6">
              {mention.description}
            </span>
          </button>
        );
      })}
    </div>
  );
};
