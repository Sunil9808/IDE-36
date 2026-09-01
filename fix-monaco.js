const fs = require('fs');
const file = 'src/components/Editor/MonacoEditor.tsx';
let content = fs.readFileSync(file, 'utf8');

const newFunc = \unction registerSmartCompletionProviders(monaco: typeof Monaco) {
  if (smartCompletionProvidersRegistered) return;
  smartCompletionProvidersRegistered = true;

  const languages = [
    'javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'jsx', 'tsx',
    'python', 'java', 'cpp', 'c', 'csharp', 'go', 'rust', 'php', 'ruby', 'swift', 'kotlin',
    'html', 'css', 'scss', 'json', 'yaml', 'markdown', 'shell', 'sql', 'plaintext',
  ];

  languages.forEach((languageId) => {
    // 1. FAST SYNCHRONOUS PROVIDER (Local features)
    monaco.languages.registerCompletionItemProvider(languageId, {
      triggerCharacters: ['.', ':', '<', '/', '"', "'", '\', '@', '#', '$', '-', '=', ' '],
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const prefix = word.word.toLowerCase();
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const htmlCompletionContext = model.getLanguageId() === 'html' ? getHtmlCompletionContext(model, position) : null;
        if (htmlCompletionContext === 'text') {
          return { suggestions: [] };
        }

        const languageSuggestions = getLanguageCompletionItems(monaco, model.getLanguageId(), range);
        const documentSuggestions = getDocumentWordCompletionItems(monaco, model, range);
        const extensionSuggestions = getExtensionCompletionItems(
          monaco,
          useExtensionStore.getState().installed,
          model.getLanguageId(),
          range
        );

        const suggestions = [...languageSuggestions, ...extensionSuggestions, ...documentSuggestions]
          .filter((suggestion) => {
            const label = String(suggestion.label).toLowerCase();
            return !prefix || label.includes(prefix);
          })
          .sort((a, b) => {
            const aLabel = String(a.label).toLowerCase();
            const bLabel = String(b.label).toLowerCase();
            return aLabel.startsWith(prefix) === bLabel.startsWith(prefix) ? aLabel.localeCompare(bLabel) : aLabel.startsWith(prefix) ? -1 : 1;
          });

        return { suggestions };
      }
    });

    // 2. SLOW ASYNCHRONOUS PROVIDER (AI Autocomplete)
    monaco.languages.registerCompletionItemProvider(languageId, {
      triggerCharacters: ['.', ':', '<', '/', '"', "'", '\', '@', '#', '$', '-', '=', ' '],
      provideCompletionItems: async (model, position, context, token) => {
        if (!useAIStore.getState().settings.inlineCompletionsEnabled) {
          return { suggestions: [] };
        }

        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const prefixCode = model.getValueInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column });
        const suffixCode = model.getValueInRange({ startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: model.getLineCount(), endColumn: model.getLineMaxColumn(model.getLineCount()) });

        try {
          const abortController = new AbortController();
          const tokenListener = token.onCancellationRequested(() => abortController.abort());

          const openTabs = useEditorStore.getState().tabs.filter(t => t.id !== useEditorStore.getState().activeTabId).map(t => ({ path: t.filePath, name: t.fileName, language: t.language, content: t.content?.slice(0, 1500) }));
          
          const aiItems = await fetchDropdownCompletion(
            prefixCode, 
            suffixCode, 
            model.getLanguageId(), 
            { workspaceName: 'my-project', openFiles: openTabs as any },
            abortController.signal
          );
          
          tokenListener.dispose();

          const aiSuggestions = aiItems.map((item: any) => ({
            label: item.label,
            kind: monaco.languages.CompletionItemKind[item.kind] || monaco.languages.CompletionItemKind.Snippet,
            insertText: item.insertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: item.detail ? '[AI] ' + item.detail : '[AI] AI Suggestion',
            range,
            sortText: '0000_ai', // AI suggestions force to top
          }));

          return { suggestions: aiSuggestions };
        } catch (e) {
          return { suggestions: [] };
        }
      }
    });
  });
}\;

content = content.replace(/function registerSmartCompletionProviders[\s\S]*?^}/m, newFunc);
fs.writeFileSync(file, content);
console.log('Replaced function');
