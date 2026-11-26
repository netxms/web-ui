import ConfirmationEventBus from 'primevue/confirmationeventbus'
import { PrimeVueConfirmSymbol } from 'primevue/useconfirm'

/**
 * Confirmation options as PrimeVue 4 reads them. Its Cancel button is a filled primary one, the
 * same as the action, so it becomes secondary (outlined, or text when the call asks for text).
 * `acceptSeverity` is a PrimeVue 3 option that PrimeVue 4 ignores; it colors the accept button.
 *
 * @param {object} options - as passed to `confirm.require`
 * @returns {object}
 */
export function withConfirmDefaults(options) {
  const { acceptSeverity, ...rest } = options
  const callerReject = rest.rejectProps ?? {}
  return {
    ...rest,
    acceptProps: acceptSeverity ? { severity: acceptSeverity, ...rest.acceptProps } : rest.acceptProps,
    rejectProps: {
      severity: 'secondary',
      ...(callerReject.text ? {} : { outlined: true }),
      ...callerReject,
    },
  }
}

/** PrimeVue's ConfirmationService, with `withConfirmDefaults` applied to every `useConfirm()`. */
export const AppConfirmationService = {
  install(app) {
    const service = {
      require: (options) => ConfirmationEventBus.emit('confirm', withConfirmDefaults(options)),
      close: () => ConfirmationEventBus.emit('close'),
    }
    app.config.globalProperties.$confirm = service
    app.provide(PrimeVueConfirmSymbol, service)
  },
}
