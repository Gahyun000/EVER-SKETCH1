// 의존성 없는 PDF 생성기 — JPEG(DCTDecode) 이미지를 페이지마다 한 장씩 담는다.
// (jspdf 등 라이브러리 없이도 이미지 기반 PDF를 만들 수 있어 배포가 가볍다.)

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const a = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i)
  return a
}

function loadSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight })
    im.onerror = () => rej(new Error('이미지 로드 실패'))
    im.src = dataUrl
  })
}

// JPEG data URL 배열 → PDF Blob. 각 이미지가 한 페이지(이미지 크기의 절반을 pt로).
export async function jpegsToPdf(dataUrls: string[]): Promise<Blob> {
  const imgs: { bytes: Uint8Array; w: number; h: number }[] = []
  for (const d of dataUrls) {
    const comma = d.indexOf(',')
    imgs.push({ bytes: b64ToBytes(d.slice(comma + 1)), ...(await loadSize(d)) })
  }
  const parts: (string | Uint8Array)[] = []
  let len = 0
  const out = (s: string | Uint8Array) => { parts.push(s); len += s.length }
  const objOffsets: number[] = []
  const N = imgs.length

  out('%PDF-1.4\n')
  out(new Uint8Array([0x25, 0xFF, 0xFF, 0xFF, 0xFF, 0x0A]))  // 바이너리 표식 주석

  const pageRefs: number[] = []
  for (let i = 0; i < N; i++) pageRefs.push(3 + i * 3)

  const writeObj = (num: number, body: string) => { objOffsets[num] = len; out(num + ' 0 obj\n' + body + '\nendobj\n') }
  writeObj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  writeObj(2, '<< /Type /Pages /Kids [' + pageRefs.map((r) => r + ' 0 R').join(' ') + '] /Count ' + N + ' >>')

  for (let i = 0; i < N; i++) {
    const img = imgs[i]
    const pageNum = 3 + i * 3, contentNum = 4 + i * 3, imgNum = 5 + i * 3
    const Wpt = Math.max(1, Math.round(img.w / 2)), Hpt = Math.max(1, Math.round(img.h / 2))
    writeObj(pageNum, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + Wpt + ' ' + Hpt + '] /Resources << /XObject << /Im0 ' + imgNum + ' 0 R >> >> /Contents ' + contentNum + ' 0 R >>')
    const content = 'q ' + Wpt + ' 0 0 ' + Hpt + ' 0 0 cm /Im0 Do Q'
    writeObj(contentNum, '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream')
    objOffsets[imgNum] = len
    out(imgNum + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + img.w + ' /Height ' + img.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + img.bytes.length + ' >>\nstream\n')
    out(img.bytes)
    out('\nendstream\nendobj\n')
  }

  const xrefStart = len
  const totalObjs = 2 + N * 3
  let xref = 'xref\n0 ' + (totalObjs + 1) + '\n0000000000 65535 f \n'
  for (let n = 1; n <= totalObjs; n++) xref += String(objOffsets[n] || 0).padStart(10, '0') + ' 00000 n \n'
  out(xref)
  out('trailer\n<< /Size ' + (totalObjs + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF')

  return new Blob(parts as BlobPart[], { type: 'application/pdf' })
}
