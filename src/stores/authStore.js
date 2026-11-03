import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useQueryClient } from '@tanstack/vue-query'
import * as authApi from '@/api/authApi'
import { resetSessionState } from '@/utils/sessionReset'
import { syncUserPreferences } from '@/utils/userPreferencesSync'

export const useAuthStore = defineStore('auth', () => {
  const queryClient = useQueryClient()
  const sessionGuid = ref(localStorage.getItem('sessionGuid'))
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))
  const error = ref(null)
  const loading = ref(false)

  /**
   * null          — not in a 2FA flow
   * { step: 'select-method', availableMethods, credentials }
   * { step: 'enter-code', method, requestId, challenge, credentials }
   */
  const twoFactor = ref(null)

  const isAuthenticated = computed(() => !!sessionGuid.value)
  const twoFactorStep = computed(() => twoFactor.value?.step ?? null)

  async function _completeLogin(result) {
    sessionGuid.value = result.sessionGuid
    user.value = result.user
    localStorage.setItem('sessionGuid', result.sessionGuid)
    localStorage.setItem('user', JSON.stringify(result.user))
    twoFactor.value = null
    // Before the shell opens, so the previous browser user's theme and columns never show.
    // Never rejects; an unreachable server means cached values.
    await syncUserPreferences(result.user)
  }

  async function login(username, password) {
    loading.value = true
    error.value = null
    try {
      const result = await authApi.login(username, password)
      if (result.twoFactorMethods) {
        twoFactor.value = {
          step: 'select-method',
          availableMethods: result.twoFactorMethods,
          credentials: { username, password },
        }
        if (result.twoFactorMethods.length === 1) {
          return selectTwoFactorMethod(result.twoFactorMethods[0])
        }
        return false
      }
      await _completeLogin(result)
      return true
    } catch (err) {
      error.value = err.message
      return false
    } finally {
      loading.value = false
    }
  }

  async function selectTwoFactorMethod(method) {
    loading.value = true
    error.value = null
    const { username, password } = twoFactor.value.credentials
    try {
      const result = await authApi.login(username, password, { method })
      if (result.requestId !== undefined || result.challenge !== undefined) {
        twoFactor.value = {
          step: 'enter-code',
          method: result.method,
          requestId: result.requestId,
          challenge: result.challenge,
          qrLabel: result.qrLabel ?? null,
          credentials: { username, password },
        }
        return false
      }
      // Method required no challenge (e.g. push notification already approved)
      await _completeLogin(result)
      return true
    } catch (err) {
      error.value = err.message
      return false
    } finally {
      loading.value = false
    }
  }

  async function submitTwoFactorCode(code) {
    loading.value = true
    error.value = null
    const { method, requestId, challenge, credentials } = twoFactor.value
    try {
      const result = await authApi.login(credentials.username, credentials.password, {
        method,
        requestId,
        challenge,
        response: code,
      })
      await _completeLogin(result)
      return true
    } catch (err) {
      // The server discards the pending login request once it has checked a code: start over.
      twoFactor.value = null
      error.value = err.message
      return false
    } finally {
      loading.value = false
    }
  }

  function cancelTwoFactor() {
    twoFactor.value = null
    error.value = null
  }

  /**
   * Without `POST /logout`: for when the session is already gone (another tab logged out, or
   * the server rejected it). Every sign-out path funnels through here.
   */
  function clearSession() {
    sessionGuid.value = null
    user.value = null
    localStorage.removeItem('sessionGuid')
    localStorage.removeItem('user')
    queryClient.clear() // stop all active polls immediately
    resetSessionState()
  }

  function logout() {
    const token = sessionGuid.value // capture before clearing — client.js awaits an import first
    clearSession()
    if (token) {
      authApi.logout(token).catch(() => {})
    }
  }

  /**
   * A revoked token would otherwise look valid until the first 401, and the cached
   * `systemAccessRights` is user-editable, so the server's copy replaces it.
   *
   * @returns {Promise<boolean>} false if the session was invalid (the user is logged out)
   */
  async function checkSession() {
    if (!sessionGuid.value) return false
    try {
      const info = await authApi.validateSession()
      user.value = {
        ...user.value,
        id: info.userId,
        username: info.userName ?? user.value?.username,
        fullName: info.fullName ?? user.value?.fullName ?? '',
        systemAccessRights: info.systemAccessRights,
      }
      localStorage.setItem('user', JSON.stringify(user.value))
      await syncUserPreferences(user.value)
      return true
    } catch (err) {
      // Only a rejected session logs out; a brief server restart must not.
      if (err?.status === 401) {
        logout()
        return false
      }
      return true
    }
  }

  return {
    sessionGuid,
    user,
    error,
    loading,
    twoFactor,
    twoFactorStep,
    isAuthenticated,
    login,
    selectTwoFactorMethod,
    submitTwoFactorCode,
    cancelTwoFactor,
    clearSession,
    logout,
    checkSession,
  }
})
