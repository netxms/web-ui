/**
 * Demo fixtures from `mocks/`, empty unless the build carries demo content. The condition
 * repeats DEMO_CONTENT_ENABLED inline because Rolldown folds a comparison written here but not
 * an imported constant, and only then do the seeds stay out of the release bundle.
 */
import map600 from '../../mocks/v1/network-maps/600.json'
import map601 from '../../mocks/v1/network-maps/601.json'
import map602 from '../../mocks/v1/network-maps/602.json'
import map603 from '../../mocks/v1/network-maps/603.json'
import dashboard700 from '../../mocks/v1/dashboards/700.json'
import dashboard701 from '../../mocks/v1/dashboards/701.json'
import dashboard702 from '../../mocks/v1/dashboards/702.json'
import dashboard703 from '../../mocks/v1/dashboards/703.json'
import dataCenterAlarms from '../../mocks/v1/_lib/dataCenterAlarms.json'
import dataCenterDevices from '../../mocks/v1/_lib/dataCenterDevices.json'

/** Demo network maps by id, already in the internal map format. */
export const DEMO_MAPS =
  import.meta.env.VITE_DEMO_CONTENT !== 'false'
    ? { 600: map600, 601: map601, 602: map602, 603: map603 }
    : {}

/** Demo dashboard seeds by id, in the API shape. */
export const DEMO_DASHBOARD_SEEDS =
  import.meta.env.VITE_DEMO_CONTENT !== 'false'
    ? { 700: dashboard700, 701: dashboard701, 702: dashboard702, 703: dashboard703 }
    : {}

/** @param {Record<string, *>} modules - glob result, keyed by the id in each path */
function byObjectId(modules) {
  return Object.fromEntries(
    Object.entries(modules).map(([file, data]) => [Number(file.match(/objects\/(\d+)/)[1]), data]),
  )
}

/**
 * Demo data center: a Facility with its power chain, cooling zones, rooms and racks. Each object
 * as GET /v1/objects/{id} answers, with its DCI configurations and current values, plus its
 * alarms (GET /v1/alarms entries) and the devices mounted in each rack (rack-layout `objects`,
 * by rack id). Ids start at 2090000000, beyond what a server allocates.
 */
export const DEMO_DATA_CENTER =
  import.meta.env.VITE_DEMO_CONTENT !== 'false'
    ? {
        objects: byObjectId(
          import.meta.glob('../../mocks/v1/objects/2090000*.json', {
            eager: true,
            import: 'default',
          }),
        ),
        dcis: byObjectId(
          import.meta.glob('../../mocks/v1/objects/2090000*/data-collection/configuration.json', {
            eager: true,
            import: 'default',
          }),
        ),
        values: byObjectId(
          import.meta.glob('../../mocks/v1/objects/2090000*/data-collection/current-values.json', {
            eager: true,
            import: 'values',
          }),
        ),
        alarms: dataCenterAlarms,
        devices: dataCenterDevices,
      }
    : { objects: {}, dcis: {}, values: {}, alarms: [], devices: {} }
