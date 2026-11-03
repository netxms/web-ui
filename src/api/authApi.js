import { post, get, ApiError, SERVER_UNAVAILABLE_STATUSES } from './client'

/**
 * Login refusals by the RCC `H_Login` puts in `errorCode` (include/nxcldefs.h); the WebAPI sends
 * no `reason` with these. An intruder lockout disables the account, so a locked account with
 * the right password answers RCC_ACCOUNT_DISABLED.
 */
const LOGIN_REFUSALS = {
  // RCC_ACCESS_DENIED
  2: 'Incorrect user name or password.',
  // RCC_ACCOUNT_DISABLED
  60:
    'This account is disabled or locked after too many failed sign-in attempts. ' +
    'Contact your administrator.',
  // RCC_NO_GRACE_LOGINS
  61:
    'The password for this account must be changed and no grace logins are left. ' +
    'Ask your administrator to reset it.',
  // RCC_2FA_SETUP_MANDATORY
  187:
    'This account requires two-factor authentication, which is not set up yet. ' +
    'Ask your administrator to set it up.',
}

/**
 * @param {ApiError} err
 * @param {{ response?: string } | null} twoFactor - the 2FA part of the request, if any
 */
function loginFailureMessage(err, twoFactor) {
  if (err.status === 0 || SERVER_UNAVAILABLE_STATUSES.has(err.status)) {
    return 'The server cannot be reached. Try again in a moment.'
  }
  // The nginx config in deploy/ rate-limits this route with limit_req_status 429.
  if (err.status === 429) return 'Too many sign-in attempts. Wait a minute, then try again.'
  if (err.status === 403) {
    // Process2FAResponse drops the pending request whatever the outcome, so the same request
    // id can never be answered again.
    if (twoFactor?.response) {
      return 'The verification code was not accepted. Sign in again to get a new one.'
    }
    const refusal = LOGIN_REFUSALS[err.data?.errorCode]
    if (refusal) return refusal
  }
  return err.message
}

/**
 * Perform a login request, supporting the multi-step 2FA challenge/response flow.
 *
 * Step 1: call with (username, password) only.
 *   - Returns { sessionGuid, user } on success (no 2FA required).
 *   - Returns { twoFactorMethods: string[] } when 2FA is required — caller should
 *     present method selection and call again with a method name.
 *
 * Step 2: call with twoFactor = { method }
 *   - Returns { sessionGuid, user } if the method needs no challenge (e.g. push).
 *   - Returns { method, requestId, challenge } when server issues a challenge — caller
 *     should prompt for the code and call again with the full params.
 *
 * Step 3: call with twoFactor = { method, requestId, challenge, response }
 *   - Returns { sessionGuid, user } on success.
 *
 * @param {string} username
 * @param {string} password
 * @param {{ method?: string, requestId?: string, challenge?: string, response?: string } | null} twoFactor
 */
export async function login(username, password, twoFactor = null) {
  const body = { username, password, ...twoFactor }
  try {
    // The sign-in form explains a refusal inline.
    const data = await post('/v1/login', body, { suppressForbidden: true })
    return {
      sessionGuid: data.token,
      user: {
        id: data.userId,
        username,
        fullName: data.fullName ?? '',
        systemAccessRights: data.systemAccessRights,
        changePassword: data.changePassword,
        graceLogins: data.graceLogins,
      },
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      const wwwAuth = err.data?.wwwAuthenticate ?? ''

      // Step-1 challenge: "2FA METHOD1,METHOD2"
      if (wwwAuth.startsWith('2FA ') && !twoFactor?.method) {
        const methods = wwwAuth
          .slice(4)
          .split(',')
          .map((m) => m.trim())
          .filter(Boolean)
        return { twoFactorMethods: methods }
      }

      // Step-2 challenge: method was sent, server returns requestId + challenge
      if (twoFactor?.method && !twoFactor?.response) {
        const requestId = err.data?.requestId ?? null
        const challenge = err.data?.challenge ?? null
        const qrLabel = err.data?.qrLabel ?? null
        return { method: twoFactor.method, requestId, challenge, qrLabel }
      }
    }
    if (err instanceof ApiError) {
      throw new ApiError(loginFailureMessage(err, twoFactor), err.status, err.data)
    }
    throw err
  }
}

export function logout(token) {
  return post(
    '/v1/logout',
    undefined,
    token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  )
}

export async function validateSession() {
  const data = await get('/v1/status')
  return {
    userId: data.userId,
    userName: data.userName,
    fullName: data.fullName,
    systemAccessRights: data.systemAccessRights,
  }
}
