import postcssRTLCSS from 'postcss-rtlcss'
import { Mode } from 'postcss-rtlcss/options'

export default {
  plugins: [
    postcssRTLCSS({
      // Keep original (LTR) rules untouched; only append [dir="rtl"] overrides.
      mode: Mode.override,
      // Ambiguous declarations (e.g. transforms) get both-direction prefixes
      // instead of leaking into the wrong direction.
      safeBothPrefix: true,
      processUrls: false,
    }),
  ],
}
