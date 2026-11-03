/**
 * NetXMS as the vendor. The netxms brand shows it as the product; other brands show it as the
 * "Built on NetXMS" mark (login page, About dialog) only while VITE_VENDOR_BRANDING=true.
 * `copyright` is the text after "Copyright (c) "; every brand's About dialog shows it, with or
 * without the mark.
 */
export const NETXMS_VENDOR = Object.freeze({
  name: 'NetXMS',
  logo: '/netxms-logo.png',
  copyright: '2003-2026 Raden Solutions',
})
