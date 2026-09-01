import React, { useEffect, useRef, useState } from 'react';
import { fileService } from '../../services/fileService';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { EditorTab } from '../../types/editor.types';

interface HtmlPreviewProps {
  content: string;
  filePath: string;
  tabs: EditorTab[];
}

export default function HtmlPreview({ content, filePath, tabs }: HtmlPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const workspacePath = useWorkspaceStore((state) => state.workspace?.path || '');
  const [previewContent, setPreviewContent] = useState(content);

  useEffect(() => {
    let cancelled = false;

    async function buildPreview() {
      const html = await inlineLinkedAssets(content, filePath, tabs, workspacePath);
      if (!cancelled) setPreviewContent(html);
    }

    void buildPreview();
    return () => {
      cancelled = true;
    };
  }, [content, filePath, tabs, workspacePath]);

  useEffect(() => {
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(previewContent);
        doc.close();
      }
    }
  }, [previewContent]);

  return (
    <div className="h-full w-full bg-white relative">
      <div className="absolute top-0 right-0 bg-black/50 text-white text-xs px-2 py-1 rounded-bl-md z-10 font-mono">
        Live Preview
      </div>
      <iframe
        ref={iframeRef}
        className="h-full w-full border-0 bg-white"
        title="Live HTML Preview"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}

async function inlineLinkedAssets(content: string, filePath: string, tabs: EditorTab[], workspacePath: string) {
  const doc = new DOMParser().parseFromString(content, 'text/html');

  await Promise.all(
    Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]')).map(async (link) => {
      const href = link.getAttribute('href');
      if (!href || !isLocalAssetUrl(href)) return;

      const css = await readLinkedAsset(href, filePath, tabs, workspacePath);
      if (css === null) return;

      const style = doc.createElement('style');
      style.textContent = css;
      copyAttributes(link, style, ['href', 'rel']);
      link.replaceWith(style);
    })
  );

  await Promise.all(
    Array.from(doc.querySelectorAll<HTMLScriptElement>('script[src]')).map(async (script) => {
      const src = script.getAttribute('src');
      if (!src || !isLocalAssetUrl(src)) return;

      const js = await readLinkedAsset(src, filePath, tabs, workspacePath);
      if (js === null) return;

      const inlineScript = doc.createElement('script');
      copyAttributes(script, inlineScript, ['src']);
      inlineScript.textContent = js;
      script.replaceWith(inlineScript);
    })
  );

  const doctype = content.trimStart().toLowerCase().startsWith('<!doctype') ? '<!DOCTYPE html>\n' : '';
  return `${doctype}${doc.documentElement.outerHTML}`;
}

async function readLinkedAsset(url: string, htmlFilePath: string, tabs: EditorTab[], workspacePath: string) {
  const assetPath = resolveAssetPath(stripUrlDecorators(url), htmlFilePath, workspacePath);
  const openTab = tabs.find((tab) => normalizePath(tab.filePath) === normalizePath(assetPath));
  if (openTab) return openTab.content;

  try {
    const file = await fileService.readFile(assetPath);
    return file.content;
  } catch {
    return null;
  }
}

function resolveAssetPath(assetUrl: string, htmlFilePath: string, workspacePath: string) {
  const normalizedHtmlPath = normalizePath(htmlFilePath);
  const normalizedWorkspacePath = normalizePath(workspacePath);
  const baseDir = normalizedHtmlPath.includes('/')
    ? normalizedHtmlPath.slice(0, normalizedHtmlPath.lastIndexOf('/'))
    : '';

  const joined = assetUrl.startsWith('/')
    ? `${normalizedWorkspacePath}${assetUrl}`
    : `${baseDir}/${assetUrl}`;

  return normalizePathSegments(joined);
}

function normalizePathSegments(path: string) {
  const normalized = normalizePath(path);
  const parts = normalized.split('/');
  const stack: string[] = [];

  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      stack.pop();
      continue;
    }
    stack.push(part);
  }

  const prefix = normalized.startsWith('/') ? '/' : '';
  return `${prefix}${stack.join('/')}`;
}

function isLocalAssetUrl(url: string) {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:|blob:|mailto:|tel:)/i.test(url.trim());
}

function stripUrlDecorators(url: string) {
  return url.split('#')[0].split('?')[0];
}

function normalizePath(path: string) {
  return path.replace(/\\/g, '/');
}

function copyAttributes(source: Element, target: Element, skip: string[]) {
  for (const attr of Array.from(source.attributes)) {
    if (!skip.includes(attr.name)) {
      target.setAttribute(attr.name, attr.value);
    }
  }
}
