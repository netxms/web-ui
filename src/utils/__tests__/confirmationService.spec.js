// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import ConfirmationEventBus from 'primevue/confirmationeventbus'
import { PrimeVueConfirmSymbol } from 'primevue/useconfirm'
import { AppConfirmationService, withConfirmDefaults } from '../confirmationService'

describe('withConfirmDefaults', () => {
  it('makes Cancel a secondary outlined button', () => {
    expect(withConfirmDefaults({ message: 'x' }).rejectProps).toEqual({
      severity: 'secondary',
      outlined: true,
    })
  })

  it('keeps what the call sets for Cancel, and a text button stays text', () => {
    expect(withConfirmDefaults({ rejectProps: { label: 'Keep', severity: 'contrast' } }).rejectProps)
      .toEqual({ severity: 'contrast', outlined: true, label: 'Keep' })
    expect(withConfirmDefaults({ rejectProps: { text: true } }).rejectProps).toEqual({
      severity: 'secondary',
      text: true,
    })
  })

  // PrimeVue 4 reads only acceptProps; acceptSeverity was PrimeVue 3.
  it('colors the accept button from acceptSeverity', () => {
    const out = withConfirmDefaults({ acceptSeverity: 'danger', acceptLabel: 'Delete' })
    expect(out.acceptProps).toEqual({ severity: 'danger' })
    expect(out.acceptLabel).toBe('Delete')
    expect('acceptSeverity' in out).toBe(false)
    expect(
      withConfirmDefaults({ acceptSeverity: 'danger', acceptProps: { severity: 'warn' } })
        .acceptProps,
    ).toEqual({ severity: 'warn' })
    expect(withConfirmDefaults({}).acceptProps).toBeUndefined()
  })

  it('passes everything else through', () => {
    const accept = () => {}
    const out = withConfirmDefaults({ header: 'H', message: 'M', subject: 'S', accept })
    expect(out).toMatchObject({ header: 'H', message: 'M', subject: 'S', accept })
  })
})

describe('AppConfirmationService', () => {
  it('provides a service that emits confirmations with the defaults', () => {
    const app = { config: { globalProperties: {} }, provide: vi.fn() }
    AppConfirmationService.install(app)
    const [symbol, service] = app.provide.mock.calls[0]
    expect(symbol).toBe(PrimeVueConfirmSymbol)
    expect(app.config.globalProperties.$confirm).toBe(service)

    const received = vi.fn()
    ConfirmationEventBus.on('confirm', received)
    try {
      service.require({ message: 'Delete?', acceptSeverity: 'danger' })
    } finally {
      ConfirmationEventBus.off('confirm', received)
    }
    expect(received).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Delete?',
        acceptProps: { severity: 'danger' },
        rejectProps: { severity: 'secondary', outlined: true },
      }),
    )
  })
})
