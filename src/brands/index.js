/**
 * Brands: the only entry point core code may import.
 *
 * A brand is a folder `src/brands/<id>/` with an `index.js` manifest:
 *   { id, productName, logo: { color, white }, header: { divider }, login: { logo },
 *     about: { productLine, copyright }, whatsNew, vendorMark, themes, defaultTheme }
 * and a `brand.json` (`productName`, optional `htmlTitle` and `favicon`) that the build
 * plugin writes into index.html. `VITE_BUILD_VARIANT` picks the brand at build time
 * (vite-plugin-netxms-brand.js); no other brand is in the bundle.
 *
 * `whatsNew`: the brand presents NetXMS release news as its own (Home panel, About link).
 * `vendorMark`: the brand is not NetXMS and may credit it ("Built on NetXMS"); the build still
 * has to opt in, see VENDOR_MARK_ENABLED.
 * `about.copyright`: the brand's own copyright line, text after "Copyright (c) ". The NetXMS
 * software copyright (NETXMS_VENDOR.copyright) is in every brand's About dialog regardless.
 */
import activeBrand from 'virtual:netxms-brand'

export { NETXMS_VENDOR } from './vendor'

export const brand = activeBrand

/**
 * @param {{ vendorMark?: boolean }} manifest
 * @param {string|undefined} setting - the raw VITE_VENDOR_BRANDING value
 * @returns {boolean}
 */
export function isVendorMarkEnabled(manifest, setting) {
  return manifest.vendorMark === true && setting === 'true'
}

/**
 * Whether the "Built on NetXMS" mark shows (login page, About dialog). Client builds are white
 * label, so the mark is opt-in: only a brand that is not NetXMS carries it, and only while its
 * build sets VITE_VENDOR_BRANDING=true (for a client that agreed to it).
 */
export const VENDOR_MARK_ENABLED = isVendorMarkEnabled(brand, import.meta.env.VITE_VENDOR_BRANDING)
