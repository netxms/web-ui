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
