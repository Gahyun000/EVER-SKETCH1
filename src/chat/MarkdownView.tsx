// 마크다운 렌더러 (Agentic-PM 이식·간소화). react-markdown + gfm + breaks.
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

interface Props { source: string; className?: string }

function normalize(source: string) {
  return (source || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n')
}

export default function MarkdownView({ source, className }: Props) {
  return (
    <div className={`markdown-view ${className || ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{normalize(source)}</ReactMarkdown>
    </div>
  )
}
