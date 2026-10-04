import { Bot, Code2, Eye, Paintbrush, Save, Settings, Type } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import { useAIStore } from '../../store/aiStore';
import { ThemeName } from '../../types/theme.types';
import { EditorSettings } from '../../types/editor.types';

const themeOptions: Array<{ value: ThemeName; label: string }> = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'high-contrast', label: 'High Contrast' },
  { value: 'monokai', label: 'Monokai' },
  { value: 'solarized-dark', label: 'Solarized Dark' },
];

const fontOptions = [
  'JetBrains Mono, Fira Code, monospace',
  'Consolas, "Courier New", monospace',
  'Cascadia Code, Consolas, monospace',
  'Fira Code, Consolas, monospace',
];

export default function SettingsEditor() {
  const { settings, updateSettings } = useEditorStore();
  const { theme, updateTheme } = useSettingsStore();
  const { settings: aiSettings, updateSettings: updateAISettings } = useAIStore();
  const {
    activityBarVisible,
    sidebarVisible,
    bottomPanelVisible,
    rightPanelVisible,
    statusBarVisible,
    setActivityBarVisible,
    setSidebarVisible,
    setBottomPanelVisible,
    setRightPanelVisible,
    setStatusBarVisible,
  } = useUIStore();

  const setEditorSetting = <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => {
    updateSettings({ [key]: value } as Partial<EditorSettings>);
  };

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg-0)] text-[var(--text-0)]">
      <div className="mx-auto max-w-[980px] px-8 py-10">
        <div className="mb-10 flex items-center gap-4 border-b border-[var(--border-0)] pb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-dim)] text-[var(--accent)] shadow-sm">
            <Settings size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-0)]">IDE Settings</h1>
            <p className="mt-1.5 text-[13px] text-[var(--text-1)]">
              Configure the editor and workspace interface to match your workflow.
            </p>
          </div>
        </div>

        <SettingsSection icon={Paintbrush} title="Appearance">
          <SelectSetting label="Color theme" value={theme} onChange={(value) => updateTheme(value as ThemeName)}>
            {themeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </SelectSetting>
          <ToggleSetting label="Activity bar" checked={activityBarVisible} onChange={setActivityBarVisible} />
          <ToggleSetting label="Primary side bar" checked={sidebarVisible} onChange={setSidebarVisible} />
          <ToggleSetting label="Bottom panel" checked={bottomPanelVisible} onChange={setBottomPanelVisible} />
          <ToggleSetting label="Anywhere AI" checked={rightPanelVisible} onChange={setRightPanelVisible} />
          <ToggleSetting label="Status bar" checked={statusBarVisible} onChange={setStatusBarVisible} />
        </SettingsSection>

        <SettingsSection icon={Type} title="Editor">
          <RangeSetting label="Font size" value={settings.fontSize} min={11} max={24} onChange={(value) => setEditorSetting('fontSize', value)} />
          <SelectSetting label="Font family" value={settings.fontFamily} onChange={(value) => setEditorSetting('fontFamily', value)}>
            {fontOptions.map((font) => <option key={font} value={font}>{font}</option>)}
          </SelectSetting>
          <RangeSetting label="Tab size" value={settings.tabSize} min={2} max={8} onChange={(value) => setEditorSetting('tabSize', value)} />
          <ToggleSetting label="Insert spaces" checked={settings.insertSpaces} onChange={(value) => setEditorSetting('insertSpaces', value)} />
          <SelectSetting label="Word wrap" value={settings.wordWrap} onChange={(value) => setEditorSetting('wordWrap', value as EditorSettings['wordWrap'])}>
            <option value="off">Off</option>
            <option value="on">On</option>
            <option value="bounded">Bounded</option>
          </SelectSetting>
        </SettingsSection>

        <SettingsSection icon={Eye} title="Editor View">
          <ToggleSetting label="Minimap" checked={settings.minimap} onChange={(value) => setEditorSetting('minimap', value)} />
          <ToggleSetting label="Sticky scroll" checked={settings.stickyScroll} onChange={(value) => setEditorSetting('stickyScroll', value)} />
          <ToggleSetting label="Bracket pair colorization" checked={settings.bracketPairColorization} onChange={(value) => setEditorSetting('bracketPairColorization', value)} />
          <ToggleSetting label="CodeLens" checked={settings.codeLens} onChange={(value) => setEditorSetting('codeLens', value)} />
          <ToggleSetting label="Inlay hints" checked={settings.inlayHints} onChange={(value) => setEditorSetting('inlayHints', value)} />
          <ToggleSetting label="Parameter hints" checked={settings.parameterHints} onChange={(value) => setEditorSetting('parameterHints', value)} />
          <SelectSetting label="Line numbers" value={settings.lineNumbers} onChange={(value) => setEditorSetting('lineNumbers', value as EditorSettings['lineNumbers'])}>
            <option value="on">On</option>
            <option value="off">Off</option>
            <option value="relative">Relative</option>
          </SelectSetting>
          <SelectSetting label="Whitespace" value={settings.renderWhitespace} onChange={(value) => setEditorSetting('renderWhitespace', value as EditorSettings['renderWhitespace'])}>
            <option value="none">None</option>
            <option value="selection">Selection</option>
            <option value="boundary">Boundary</option>
            <option value="all">All</option>
          </SelectSetting>
        </SettingsSection>

        <SettingsSection icon={Save} title="Saving and Formatting">
          <ToggleSetting label="Auto save" checked={settings.autoSave} onChange={(value) => setEditorSetting('autoSave', value)} />
          <RangeSetting label="Auto save delay" value={settings.autoSaveDelay} min={250} max={5000} step={250} onChange={(value) => setEditorSetting('autoSaveDelay', value)} />
          <ToggleSetting label="Format on save" checked={settings.formatOnSave} onChange={(value) => setEditorSetting('formatOnSave', value)} />
          <ToggleSetting label="Format on paste" checked={settings.formatOnPaste} onChange={(value) => setEditorSetting('formatOnPaste', value)} />
        </SettingsSection>

        <SettingsSection icon={Bot} title="Anywhere AI">
          <ToggleSetting label="Show Anywhere AI panel" checked={rightPanelVisible} onChange={setRightPanelVisible} />
          <ToggleSetting
            label="Inline AI completions (Tab)"
            checked={aiSettings.inlineCompletionsEnabled}
            onChange={(value) => updateAISettings({ inlineCompletionsEnabled: value })}
          />
          <RangeSetting
            label="Inline completion delay (ms)"
            value={aiSettings.inlineCompletionsDelay}
            min={200}
            max={1200}
            step={50}
            onChange={(value) => updateAISettings({ inlineCompletionsDelay: value })}
          />
          <ToggleSetting
            label="Include file context in AI"
            checked={aiSettings.includeFileContext}
            onChange={(value) => updateAISettings({ includeFileContext: value })}
          />
        </SettingsSection>

        <SettingsSection icon={Code2} title="Layout">
          <p className="text-[13px] leading-relaxed text-[var(--text-1)] p-4">
            Layout toggles above update the IDE immediately. Editor-specific settings apply to the code editor as you open or focus files.
          </p>
        </SettingsSection>
      </div>
    </div>
  );
}

function SettingsSection({ icon: Icon, title, children }: { icon: typeof Settings; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-lg border border-[var(--border-0)] bg-[var(--bg-1)] shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 border-b border-[var(--border-0)] bg-[var(--bg-2)]/50 px-4 py-3">
        <Icon size={16} className="text-[var(--accent)]" />
        <h2 className="text-[13px] font-semibold text-[var(--text-0)] uppercase tracking-wider">{title}</h2>
      </div>
      <div className="divide-y divide-[var(--border-0)]">
        {children}
      </div>
    </section>
  );
}

function ToggleSetting({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex min-h-[48px] items-center justify-between gap-4 px-4 py-3 cursor-pointer hover:bg-[var(--bg-2)]/30 transition-colors group">
      <span className="text-[13px] text-[var(--text-1)] group-hover:text-[var(--text-0)] transition-colors font-medium">{label}</span>
      <div className="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" className="sr-only peer" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
        <div className="w-9 h-5 bg-[var(--bg-4)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--accent)] border border-[var(--border-2)] peer-checked:border-[var(--accent)] shadow-inner"></div>
      </div>
    </label>
  );
}

function RangeSetting({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid min-h-[56px] grid-cols-[180px_1fr_72px] items-center gap-4 px-4 py-3 hover:bg-[var(--bg-2)]/30 transition-colors group">
      <span className="text-[13px] text-[var(--text-1)] group-hover:text-[var(--text-0)] transition-colors font-medium">{label}</span>
      <input 
        type="range" min={min} max={max} step={step} value={value} 
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="w-full h-1.5 bg-[var(--bg-4)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]" 
      />
      <input
        className="h-7 w-full rounded border border-[var(--border-1)] bg-[var(--bg-0)] px-2 text-[12px] text-[var(--text-0)] outline-none focus:border-[var(--accent)] transition-colors text-center"
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function SelectSetting({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="grid min-h-[52px] grid-cols-[180px_1fr] items-center gap-4 px-4 py-3 hover:bg-[var(--bg-2)]/30 transition-colors group">
      <span className="text-[13px] text-[var(--text-1)] group-hover:text-[var(--text-0)] transition-colors font-medium">{label}</span>
      <select
        className="h-8 w-full max-w-[300px] rounded border border-[var(--border-1)] bg-[var(--bg-0)] px-2.5 text-[12px] text-[var(--text-0)] outline-none focus:border-[var(--accent)] transition-colors cursor-pointer shadow-sm"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {children}
      </select>
    </label>
  );
}
