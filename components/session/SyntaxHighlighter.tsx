'use client';

import ReactSyntaxHighlighter from 'react-syntax-highlighter';
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs';

interface Props {
  code: string;
  language?: string;
}

export function SyntaxHighlighter({ code, language = 'javascript' }: Props) {
  return (
    <ReactSyntaxHighlighter
      language={language}
      style={atomOneDark}
      customStyle={{ background: 'transparent', padding: '0', fontSize: '13px' }}
    >
      {code}
    </ReactSyntaxHighlighter>
  );
}
