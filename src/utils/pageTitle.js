// Most specific first, so the part that tells tabs apart survives truncation:
// "core-sw-01 - Infrastructure - <product>".

import { brand } from '@/brands'

const APP_NAME = brand.productName

let routeTitle = ''
let detailTitle = ''

function render() {
  document.title = [detailTitle, routeTitle, APP_NAME].filter(Boolean).join(' - ')
}

/**
 * Clears the detail title, which would otherwise linger from the previous view until the new
 * one mounts.
 * @param {string} [title]
 */
export function setRouteTitle(title) {
  routeTitle = title ?? ''
  detailTitle = ''
  render()
}

/** @param {string} [title] */
export function setDetailTitle(title) {
  detailTitle = title ?? ''
  render()
}
