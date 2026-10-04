import React from 'react';
import { useAIStore } from '../../../store/aiStore';
import { Zap, BookOpen, Sparkles, Shield } from 'lucide-react';

export const ProfileSelector: React.FC = () => {
  const { availableProfiles, selectedProfile, setSelectedProfile } = useAIStore();

  const getIcon = (icon: string) => {
    switch (icon) {
      case 'zap': return <Zap size={14} />;
      case 'book-open': return <BookOpen size={14} />;
      case 'sparkles': return <Sparkles size={14} />;
      case 'shield': return <Shield size={14} />;
      default: return <Zap size={14} />;
    }
  };

  return (
    <div className="flex items-center gap-2 mb-3">
      {availableProfiles.map(profile => {
        const isActive = selectedProfile === profile.id;
        return (
          <button
            key={profile.id}
            title={profile.description}
            onClick={() => setSelectedProfile(profile.id)}
            className={`flex-1 flex flex-col items-center justify-center p-2 rounded-lg transition-all border ${
              isActive 
                ? 'bg-[#2a313a] border-gray-600 shadow-sm' 
                : 'bg-[#151b20] border-transparent hover:bg-[#1e2329]'
            }`}
            style={{ color: isActive ? profile.color : '#9ca3af' }}
          >
            <div className="mb-1">{getIcon(profile.icon)}</div>
            <span className="text-[10px] font-medium">{profile.name}</span>
          </button>
        );
      })}
    </div>
  );
};
