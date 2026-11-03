<script setup>
import { ref, watch, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Card from 'primevue/card'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'
import InputOtp from 'primevue/inputotp'
import Message from 'primevue/message'
import { useAuthStore } from '@/stores/authStore'
import FormField from '@/components/common/FormField.vue'
import { brand, VENDOR_MARK_ENABLED, NETXMS_VENDOR } from '@/brands'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const otpValue = ref('')
const qrDataUrl = ref(null)

const qrLabel = computed(() => authStore.twoFactor?.qrLabel ?? null)

const totpSecret = computed(() => {
  if (!qrLabel.value) return null
  try {
    return new URL(qrLabel.value).searchParams.get('secret')
  } catch {
    return null
  }
})

const secretVisible = ref(false)
const copied = ref(false)

async function copySecret() {
  if (!totpSecret.value) return
  await navigator.clipboard.writeText(totpSecret.value)
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 2000)
}

watch(
  qrLabel,
  async (uri) => {
    secretVisible.value = false
    copied.value = false
    if (!uri) {
      qrDataUrl.value = null
      return
    }
    // Loaded on demand to keep the QR encoder out of the login chunk.
    const { default: QRCode } = await import('qrcode')
    qrDataUrl.value = await QRCode.toDataURL(uri, { width: 200, margin: 1 })
  },
  { immediate: true },
)

async function handleLogin() {
  const success = await authStore.login(username.value, password.value)
  if (success) redirectAfterLogin()
}

async function handleSelectMethod(method) {
  const success = await authStore.selectTwoFactorMethod(method)
  if (success) redirectAfterLogin()
}

async function handleSubmitCode() {
  if (!otpValue.value || otpValue.value.length < 6) return
  const success = await authStore.submitTwoFactorCode(otpValue.value)
  if (success) redirectAfterLogin()
  else otpValue.value = ''
}

function handleBack() {
  authStore.cancelTwoFactor()
  otpValue.value = ''
}

/**
 * `redirect` is attacker-controllable in a link: only same-site absolute paths are followed
 * (not `//evil.com` or a scheme-bearing URL), and a repeated `?redirect=` yields an array.
 */
function safeRedirectTarget() {
  const target = route.query.redirect
  if (typeof target !== 'string') return '/home'
  if (!target.startsWith('/') || target.startsWith('//')) return '/home'
  return target
}

function redirectAfterLogin() {
  router.push(safeRedirectTarget())
}

watch(otpValue, (val) => {
  if (val?.length === 6) handleSubmitCode()
})
</script>

<template>
  <div class="login-page">
    <Card class="login-card" :class="!authStore.twoFactorStep ? '' : 'two-factor'">
      <template #title>
        <div v-if="brand.login.logo" class="login-brand">
          <img :src="brand.logo[brand.login.logo]" alt="" class="login-brand-logo" />
          <h1 class="login-product">{{ brand.productName }}</h1>
        </div>
        <div v-else class="login-header">
          <i class="pi pi-server login-logo" />
          <h1 class="login-title">{{ brand.productName }}</h1>
        </div>
      </template>
      <template #content>
        <!-- Step 1: credentials -->
        <form v-if="!authStore.twoFactorStep" class="login-form" @submit.prevent="handleLogin">
          <Message v-if="authStore.error" severity="error" :closable="false">
            {{ authStore.error }}
          </Message>
          <div class="login-field">
            <label for="username">Username</label>
            <InputText
              id="username"
              v-model="username"
              placeholder="Enter username"
              autocomplete="username"
              fluid
              autofocus
            />
          </div>
          <div class="login-field">
            <label for="password">Password</label>
            <!-- Password sets inheritAttrs: false, so autocomplete must go via input-props. -->
            <Password
              id="password"
              v-model="password"
              placeholder="Enter password"
              :input-props="{ autocomplete: 'current-password' }"
              :feedback="false"
              toggle-mask
              fluid
            />
          </div>
          <Button
            type="submit"
            label="Sign In"
            icon="pi pi-sign-in"
            :loading="authStore.loading"
            fluid
          />
        </form>

        <!-- Step 2: method selection -->
        <div v-else-if="authStore.twoFactorStep === 'select-method'" class="login-form">
          <Message v-if="authStore.error" severity="error" :closable="false">
            {{ authStore.error }}
          </Message>
          <p class="two-factor-hint">
            This account requires two-factor authentication. Choose a method to continue.
          </p>
          <div class="method-list">
            <Button
              v-for="method in authStore.twoFactor.availableMethods"
              :key="method"
              :label="method"
              icon="pi pi-shield"
              :loading="authStore.loading"
              fluid
              @click="handleSelectMethod(method)"
            />
          </div>
          <Button
            label="Back"
            icon="pi pi-arrow-left"
            severity="secondary"
            text
            fluid
            :disabled="authStore.loading"
            @click="handleBack"
          />
        </div>

        <!-- Step 3: code entry -->
        <div v-else-if="authStore.twoFactorStep === 'enter-code'" class="login-form">
          <Message v-if="authStore.error" severity="error" :closable="false">
            {{ authStore.error }}
          </Message>
          <div v-if="qrDataUrl" class="qr-setup">
            <img :src="qrDataUrl" alt="TOTP QR code" class="qr-image" />
            <div class="qr-setup-info">
              <p class="two-factor-hint">
                Scan this QR code with your authenticator app to set up TOTP, then enter the
                generated code below.
              </p>
              <div v-if="totpSecret" class="secret-row">
                <InputText
                  :value="secretVisible ? totpSecret : '••••••••••••••••'"
                  readonly
                  class="secret-input"
                />
                <Button
                  :icon="secretVisible ? 'pi pi-eye-slash' : 'pi pi-eye'"
                  severity="secondary"
                  text
                  :aria-label="secretVisible ? 'Hide secret' : 'Show secret'"
                  @click="secretVisible = !secretVisible"
                />
                <Button
                  :icon="copied ? 'pi pi-check' : 'pi pi-copy'"
                  :severity="copied ? 'success' : 'secondary'"
                  text
                  aria-label="Copy secret"
                  @click="copySecret"
                />
              </div>
            </div>
          </div>
          <FormField
            class="login-field"
            :label="`${
              authStore.twoFactor.method === 'TOTP'
                ? 'Enter the code from your authenticator app'
                : 'Enter the code sent to you'
            }`"
            group
          >
            <div class="otp-input-row">
              <InputOtp v-model="otpValue" :length="6" integer-only />
            </div>
          </FormField>
          <Button
            label="Verify"
            icon="pi pi-check"
            :loading="authStore.loading"
            :disabled="!otpValue || otpValue.length < 6"
            fluid
            @click="handleSubmitCode"
          />
          <Button
            label="Back"
            icon="pi pi-arrow-left"
            severity="secondary"
            text
            fluid
            :disabled="authStore.loading"
            @click="handleBack"
          />
        </div>
      </template>
    </Card>
    <!-- White label: no vendor credit unless the build opts in (VITE_VENDOR_BRANDING). -->
    <p v-if="VENDOR_MARK_ENABLED" class="login-vendor">
      <img :src="NETXMS_VENDOR.logo" alt="" class="login-vendor-logo" />
      Built on NetXMS
    </p>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.login-card {
  width: 100%;
  max-width: 400px;
  margin: 1.2rem;
}
.login-card.two-factor {
  max-width: 500px;
}
.login-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.9rem;
}

.login-logo {
  font-size: 2rem;
  color: var(--p-primary-color);
}

.login-title {
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0;
}

.login-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.login-brand-logo {
  height: 3rem;
  width: auto;
  display: block;
}

.login-product {
  margin: 0;
  font-size: 1.375rem;
  font-weight: 600;
}

/* Sits on the page background, not the card: brands that paint the page set --app-login-fg. */
.login-vendor {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  font-size: 0.8125rem;
  color: var(--app-login-fg, var(--p-text-muted-color));
}

.login-vendor-logo {
  height: 1rem;
  width: auto;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.login-field {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.login-field label,
.otp-label {
  font-size: 0.875rem;
  font-weight: 600;
}

.two-factor-hint {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.method-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.otp-label {
  text-align: center;
}

.otp-input-row {
  display: flex;
  justify-content: center;
}

.qr-setup {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 1.2rem;
  padding: 1.05rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius);
  background: var(--p-content-background);
}

.qr-image {
  width: 156px;
  height: 156px;
  flex-shrink: 0;
  border-radius: var(--p-border-radius);
}

.qr-setup-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.9rem;
  flex: 1;
  min-width: 0;
  align-self: center;
}

.secret-row {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.secret-input {
  flex: 1;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  min-width: 0;
}
</style>
