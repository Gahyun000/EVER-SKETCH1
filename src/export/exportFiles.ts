import { toJpeg } from 'html-to-image'
import type { Page } from '../state/store'
import { jpegsToPdf } from './jpegPdf'

// 기본 다운로드(폴더 지정 미지원 환경 폴백) — 브라우저 다운로드 폴더에 저장.
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

// 저장 위치 선택 대화상자를 먼저 띄우고(사용자 제스처 유지), 그다음 파일을 만들어 쓴다.
// 미지원 브라우저면 기본 다운로드 폴더로 폴백. 사용자가 취소하면 조용히 종료.
// 반환: 'saved' | 'canceled'
export async function saveWithPicker(
  makeBlob: () => Promise<Blob>,
  suggestedName: string,
  opts: { desc: string; mime: string; ext: string },
): Promise<'saved' | 'canceled'> {
  const w = window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }> }
  if (typeof w.showSaveFilePicker === 'function') {
    let handle
    try {
      handle = await w.showSaveFilePicker({ suggestedName, types: [{ description: opts.desc, accept: { [opts.mime]: ['.' + opts.ext] } }] })
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'canceled'
      handle = null  // 그 외 오류(권한 등)는 폴백
    }
    if (handle) {
      const blob = await makeBlob()
      const ws = await handle.createWritable()
      await ws.write(blob)
      await ws.close()
      return 'saved'
    }
  }
  const blob = await makeBlob()
  downloadBlob(blob, suggestedName)
  return 'saved'
}

// 각 슬라이드를 이미지로 떠서 한 PDF로 묶기(이미지 기반). 저장 위치는 대화상자로 선택.
export async function exportPdf(pages: Page[], title: string): Promise<'saved' | 'canceled'> {
  const make = async () => {
    const jpegs: string[] = []
    for (const p of pages) {
      const node = document.getElementById('export-page-' + p.id) as HTMLElement | null
      if (!node) continue
      jpegs.push(await toJpeg(node, { pixelRatio: 2, quality: 0.92, cacheBust: true, backgroundColor: '#ffffff' }))
    }
    if (!jpegs.length) throw new Error('내보낼 페이지가 없습니다')
    return jpegsToPdf(jpegs)
  }
  return saveWithPicker(make, (title || '슬라이드') + '.pdf', { desc: 'PDF 문서', mime: 'application/pdf', ext: 'pdf' })
}
