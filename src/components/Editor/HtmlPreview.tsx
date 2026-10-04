import React, { useEffect, useRef } from 'react';

export default function HtmlPreview({ content }: { content: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(content);
        doc.close();
      }
    }
  }, [content]);

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
