import { inject, provide } from 'vue'
import { objectTarget } from '@/utils/routeTargets'

const KEY = Symbol('dataCenterTarget')

/**
 * Data center views link to rooms, domains and zones in the perspective that hosts them:
 * Infrastructure by default, or wherever the builder of a hosting perspective points.
 *
 * @param {(object: object, viewId?: string) => import('vue-router').RouteLocationRaw} builder
 */
export function provideDataCenterTarget(builder) {
  provide(KEY, builder)
}

/** @returns {(object: object, viewId?: string) => import('vue-router').RouteLocationRaw} */
export function useDataCenterTarget() {
  return inject(KEY, objectTarget)
}
