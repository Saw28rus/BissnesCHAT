const MAX_EDGE = 1280
const TARGET_BYTES = 1_000_000
const START_QUALITY = 0.74
const MIN_QUALITY = 0.55

export function isPhotoType(type: string) {
  return type === "image/jpeg" || type === "image/png" || type === "image/webp"
}

export async function prepareUpload(file: File): Promise<File> {
  if (!(await shouldCompress(file))) return file
  try {
    return await compressPhoto(file)
  } catch {
    if (isPhotoType(file.type)) return file
    throw new Error("Это фото отправить нельзя")
  }
}

async function shouldCompress(file: File) {
  const type = file.type.toLowerCase()
  if (type === "image/svg+xml" || type === "image/gif") return false
  if (type.startsWith("image/")) return true
  if (/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) return true
  if (type && type !== "application/octet-stream") return false
  return hasPhotoMagic(file)
}

async function hasPhotoMagic(file: File) {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  if (head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF) return true
  if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4E && head[3] === 0x47) return true
  if (head.length >= 12) {
    const ascii = String.fromCharCode(...head.slice(0, 12))
    if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return true
  }
  return false
}

async function compressPhoto(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) throw new Error("canvas")
    context.drawImage(bitmap, 0, 0, width, height)
    let quality = START_QUALITY
    let blob = await encode(canvas, quality)
    while (blob.size > TARGET_BYTES && quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality - 0.08)
      blob = await encode(canvas, quality)
    }
    return new File([blob], photoName(file.name), { type: "image/jpeg", lastModified: Date.now() })
  } finally {
    bitmap.close()
  }
}

function encode(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error("encode"))
    }, "image/jpeg", quality)
  })
}

function photoName(name: string) {
  const base = name.replace(/\.[^.]+$/, "").trim() || "photo"
  return `${base.slice(0, 80)}.jpg`
}
