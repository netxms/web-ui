import { describe, it, expect, vi, beforeEach } from 'vitest'
import { saveDashboard } from '../dashboardsApi'
import { updateObjectDashboardContent } from '../objectsApi'
import { resetDemoDashboardCache, getDemoDashboard } from '../demoDashboardStorage'

vi.mock('../objectsApi', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, updateObjectDashboardContent: vi.fn() }
})

beforeEach(() => {
  localStorage.clear()
  resetDemoDashboardCache()
  vi.mocked(updateObjectDashboardContent).mockReset()
})

describe('saveDashboard', () => {
  it('persists demo dashboards to localStorage without calling the WebAPI', async () => {
    const widget = {
      id: 'demo-widget',
      type: 'label',
      apiType: 0,
      x: 0,
      y: 0,
      w: 4,
      h: 1,
      config: { text: 'Hi' },
      raw: { data: {}, layout: {} },
    }

    await saveDashboard(700, { cols: 6, widgets: [widget] })

    expect(updateObjectDashboardContent).not.toHaveBeenCalled()
    const stored = getDemoDashboard(700)
    expect(stored.numColumns).toBe(6)
    expect(stored.elements).toHaveLength(1)
    expect(stored.elements[0].guid).toBe('demo-widget')
  })

  it('saves real dashboards through PUT /v1/objects/{id}/dashboard, sending only numColumns and elements', async () => {
    const widget = {
      id: 'real-guid',
      type: 'label',
      apiType: 0,
      x: 0,
      y: 0,
      w: 4,
      h: 1,
      config: { text: 'Hi' },
      raw: { data: {}, layout: {} },
    }

    updateObjectDashboardContent.mockResolvedValue({
      id: 900,
      class: 'Dashboard',
      name: 'Real Dashboard',
      numColumns: 12,
      elements: [
        { guid: 'real-guid', type: 0, data: { title: 'Hi' }, layout: { horizontalSpan: 4 } },
      ],
    })

    const result = await saveDashboard(900, { cols: 12, widgets: [widget] })

    expect(updateObjectDashboardContent).toHaveBeenCalledTimes(1)
    const [id, payload] = updateObjectDashboardContent.mock.calls[0]
    expect(id).toBe(900)
    expect(Object.keys(payload).sort()).toEqual(['elements', 'numColumns'])
    expect(payload.numColumns).toBe(12)
    expect(payload.elements).toHaveLength(1)
    expect(payload.elements[0]).toMatchObject({ guid: 'real-guid', type: 0 })

    // Response is round-tripped through adaptApiDashboard into the internal shape
    expect(result.id).toBe(900)
    expect(result.cols).toBe(12)
    expect(result.widgets).toHaveLength(1)
  })

  it('forwards the scrollable flag when the caller passes it', async () => {
    updateObjectDashboardContent.mockResolvedValue({ id: 5, class: 'Dashboard', elements: [] })

    await saveDashboard(5, { cols: 4, scrollable: true, widgets: [] })

    expect(updateObjectDashboardContent).toHaveBeenCalledWith(5, {
      numColumns: 4,
      scrollable: true,
      elements: [],
    })
  })

  // serializeDashboard defaults the flag to false; sending that would switch it off on the
  // server for a caller that never loaded it.
  it('sends no scrollable key when the caller did not pass one', async () => {
    updateObjectDashboardContent.mockResolvedValue({ id: 5, class: 'Dashboard', elements: [] })

    await saveDashboard(5, { cols: 4, widgets: [] })

    const [, payload] = updateObjectDashboardContent.mock.calls[0]
    expect('scrollable' in payload).toBe(false)
  })

  it('forwards the display priority when it is a number', async () => {
    updateObjectDashboardContent.mockResolvedValue({ id: 5, class: 'Dashboard', elements: [] })

    await saveDashboard(5, { cols: 4, displayPriority: 3, widgets: [] })

    expect(updateObjectDashboardContent.mock.calls[0][1].displayPriority).toBe(3)
  })

  it('forwards the object-context flags on a server that reports them', async () => {
    updateObjectDashboardContent.mockResolvedValue({ id: 5, class: 'Dashboard', elements: [] })

    await saveDashboard(5, {
      cols: 4,
      showAsObjectView: true,
      showContextSelector: false,
      objectContextFlagsSupported: true,
      widgets: [],
    })

    const [, payload] = updateObjectDashboardContent.mock.calls[0]
    expect(payload.showAsObjectView).toBe(true)
    expect(payload.showContextSelector).toBe(false)
    expect('objectContextFlagsSupported' in payload).toBe(false)
  })

  // An older server drops unknown keys silently; sending them would pretend they were saved.
  it('sends no object-context flags to a server that does not report them', async () => {
    updateObjectDashboardContent.mockResolvedValue({ id: 5, class: 'Dashboard', elements: [] })

    await saveDashboard(5, {
      cols: 4,
      showAsObjectView: true,
      showContextSelector: true,
      objectContextFlagsSupported: false,
      widgets: [],
    })

    const [, payload] = updateObjectDashboardContent.mock.calls[0]
    expect('showAsObjectView' in payload).toBe(false)
    expect('showContextSelector' in payload).toBe(false)
  })
})
