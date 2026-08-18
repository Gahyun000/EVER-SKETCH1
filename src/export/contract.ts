// uniever_ebook generator.py 연결 계약 (불변). uniever_ebook은 수정하지 않는다.
export const GENERATOR = {
  buildCmd: (folder: string, title: string) =>
    `python3 generator.py build "${folder}" --style card --title "${title}"`,
  fileNames: {
    cover: '표지.png',
    toc: '00. 목차.png',
    content: (seq: number, title: string) => `${String(seq).padStart(2, '0')}. ${title}.png`,
    back: '뒷표지.png',
  },
  detailTypes: ['none', 'url', 'html'] as const,
} as const

// 한글 파일명 안전화 (tocTitle 원문은 별도 유지)
export function sanitizeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()
}
