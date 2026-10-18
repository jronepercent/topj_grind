/** Card widths inside a home <Row>. Plain strings so server and client files can both import them. */
export const ROW_W = {
  /** 16:9 cards (video, playlist, mixed "latest"): ~72vw capped at 300px on phones. */
  video: "w-[min(72vw,300px)] sm:w-[280px] lg:w-[300px] xl:w-[320px]",
  /** square podcast art */
  podcast: "w-[160px] sm:w-[180px]",
  article: "w-[min(70vw,260px)] sm:w-[280px]",
  product: "w-[160px] sm:w-[200px]",
} as const;

/** `sizes` hints for next/image so a row card never downloads a full-width image. */
export const ROW_SIZES = {
  video: "(max-width:640px) 72vw, 320px",
  podcast: "(max-width:640px) 160px, 180px",
  article: "(max-width:640px) 70vw, 280px",
} as const;
