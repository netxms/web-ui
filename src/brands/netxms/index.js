import '@fontsource-variable/arimo'
import '@fontsource-variable/arimo/wght-italic.css'
import './brand.css'
import meta from './brand.json'
import { NETXMS_VENDOR } from '../vendor'
import { THEMES } from './themes'

/** NetXMS, the default brand. */
export default {
  id: 'netxms',
  productName: meta.productName,
  logo: { color: NETXMS_VENDOR.logo, white: NETXMS_VENDOR.logo },
  header: { divider: false },
  login: { logo: 'color' },
  // No copyright line of its own: the About dialog shows NETXMS_VENDOR.copyright for every brand.
  about: { productLine: 'NetXMS Management Console', copyright: null },
  whatsNew: true,
  vendorMark: false,
  themes: THEMES,
  defaultTheme: 'flame',
}
