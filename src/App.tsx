import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes';
import { useSettingsStore } from './store/settingsStore';
import { useEditorStore } from './store/editorStore';
import { themeService } from './services/themeService';
import { fileService } from './services/fileService';
import { outputService } from './services/outputService';

function App() {
  const { theme } = useSettingsStore();

  useEffect(() => {
    const t = themeService.getTheme(theme);
    themeService.applyTheme(t);
  }, [theme]);

  useEffect(() => {
    outputService.initialize();
    return () => {
      outputService.cleanup();
    };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const tabs = useEditorStore.getState().tabs;
      const dirtyTabs = tabs.filter(t => t.isDirty);
      if (dirtyTabs.length > 0) {
        // Attempt to save them
        for (const tab of dirtyTabs) {
          fileService.writeFile(tab.filePath, tab.content).catch(() => {});
        }
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
