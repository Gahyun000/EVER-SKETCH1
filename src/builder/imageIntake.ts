// 이미지를 캔버스에 넣기 전에 줄인다.
//
// 이미지는 base64 data URL 로 el.src 에 그대로 들어가고, 자동저장은 부분 저장이 아니라
// 문서 전체를 PUT 한다. 3MB 사진 5장이면 base64 로 약 20MB 이고, 도형을 한 번 움직일 때마다
// 그 20MB 를 딥카피 + stringify 해서 통째로 올린다 — 클릭 한 번마다 화면이 수백 ms 멎는다.
//
// 근본 해결은 서버에 blob 업로드 엔드포인트를 두고 URL 만 저장하는 것이다.
// 그 전까지는 들어오는 시점에 크기를 줄여 페이로드를 한 자릿수 MB 아래로 눌러 둔다.
// 페이지가 A4 기준 800px 남짓이므로 긴 변 1600px 이면 2배 해상도까지 충분하다.

const MAX_EDGE = 1600
const JPEG_QUALITY = 0.82
/** 이 크기 이하의 원본은 손대지 않는다(아이콘·투명 PNG 를 괜히 열화시키지 않기 위해). */
const SKIP_UNDER_BYTES = 256 * 1024

export interface IntakeResult { src: string; w: number; h: number }

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error || new Error('이미지를 읽지 못했습니다'))
    r.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('이미지를 여는 데 실패했습니다'))
    img.src = src
  })
}

/**
 * 파일을 캔버스에 넣을 수 있는 data URL 로 만든다.
 * 큰 이미지는 긴 변 기준으로 축소하고, 투명도가 필요 없으면 JPEG 로 다시 인코딩한다.
 * 어떤 이유로든 실패하면 원본 data URL 을 그대로 돌려준다(기능이 멈추는 것보다 낫다).
 */
export async function intakeImage(file: File): Promise<IntakeResult> {
  const raw = await readAsDataUrl(file)
  try {
    const img = await loadImage(raw)
    const w0 = img.naturalWidth || img.width
    const h0 = img.naturalHeight || img.height
    const long = Math.max(w0, h0)
    const small = file.size <= SKIP_UNDER_BYTES
    if (small || long <= MAX_EDGE) return { src: raw, w: w0, h: h0 }

    const scale = MAX_EDGE / long
    const w = Math.max(1, Math.round(w0 * scale))
    const h = Math.max(1, Math.round(h0 * scale))
    const cv = document.createElement('canvas')
    cv.width = w; cv.height = h
    const cx = cv.getContext('2d')
    if (!cx) return { src: raw, w: w0, h: h0 }
    // PNG/GIF 는 투명도가 있을 수 있으므로 PNG 로, 그 외(사진)는 JPEG 로.
    const keepAlpha = /^image\/(png|gif|webp)$/i.test(file.type)
    if (!keepAlpha) { cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h) }
    cx.drawImage(img, 0, 0, w, h)
    const out = keepAlpha ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', JPEG_QUALITY)
    // 줄인 게 더 크면(작은 PNG 등) 원본을 쓴다.
    return out.length < raw.length ? { src: out, w, h } : { src: raw, w: w0, h: h0 }
  } catch {
    return { src: raw, w: 0, h: 0 }
  }
}
