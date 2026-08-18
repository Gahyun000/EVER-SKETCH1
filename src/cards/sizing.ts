import type { Orientation } from '../state/store'
export function pageSize(orientation: Orientation) {
  const land = orientation === 'landscape'
  const W = land ? 640 : 432
  const H = land ? 482 : 576
  const SC = land ? W / 440 : H / 400
  return { W, H, SC, land }
}
