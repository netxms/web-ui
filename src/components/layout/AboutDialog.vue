<script setup>
import { computed, ref } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { useAuthStore } from '@/stores/authStore'
import { useServerInfo } from '@/queries/useServerQueries'
import { changelogUrl } from '@/utils/changelogUrl'
import { brand, VENDOR_MARK_ENABLED, NETXMS_VENDOR } from '@/brands'

const authStore = useAuthStore()
const { data: serverInfo } = useServerInfo()

// Vite's `define` substitutes in script code only; in a template it would be
// `_ctx.__APP_VERSION__`, undefined at runtime.
const appVersion = __APP_VERSION__
const appBuildDate = __APP_BUILD_DATE__

const visible = ref(false)

function open() {
  visible.value = true
}

defineExpose({ open })

// VITE_API_BASE_URL may be relative (same-origin deployment); then the browser's host is the
// answer.
const host = computed(() => {
  const base = import.meta.env.VITE_API_BASE_URL
  if (!base) return window.location.host
  try {
    return new URL(base, window.location.origin).host
  } catch {
    return base
  }
})

const serverName = computed(() => serverInfo.value?.name || null)
const serverVersion = computed(() => serverInfo.value?.version || null)
const serverBuild = computed(() => serverInfo.value?.build || null)
const serverId = computed(() => serverInfo.value?.id ?? null)

const username = computed(() => authStore.user?.username ?? 'unknown')

// Shown for the NetXMS brand, and for other brands only while the vendor mark is on (white
// label by default).
const changelogLink = computed(() => changelogUrl(serverVersion.value))
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="`About ${brand.productName}`"
    :style="{ width: '30rem' }"
    :breakpoints="{ '640px': '90vw' }"
  >
    <div class="about-body">
      <div class="about-brand">
        <img :src="brand.logo.color" alt="" class="about-logo" />
      </div>

      <div class="about-details">
        <p class="about-product">{{ brand.about.productLine }} {{ appVersion }}</p>
        <!-- The software copyright is in every brand's About, white label or not. -->
        <div class="about-copyright">
          <p v-if="brand.about.copyright">Copyright &copy; {{ brand.about.copyright }}</p>
          <p>Copyright &copy; {{ NETXMS_VENDOR.copyright }}</p>
        </div>

        <dl class="about-facts">
          <dt>Connected to</dt>
          <dd>
            {{ host }}<template v-if="serverName"> ({{ serverName }})</template> as
            {{ username }}
          </dd>

          <dt>Server version</dt>
          <dd>
            <template v-if="serverVersion">
              {{ serverVersion }}<template v-if="serverBuild"> (build {{ serverBuild }})</template>
            </template>
            <template v-else>Unknown</template>
          </dd>

          <dt>Server ID</dt>
          <dd>{{ serverId ?? 'Unknown' }}</dd>

          <dt>Console build</dt>
          <dd>{{ appBuildDate }}</dd>
        </dl>

        <a
          v-if="brand.whatsNew && changelogLink"
          :href="changelogLink"
          target="_blank"
          rel="noopener noreferrer"
          class="about-changelog"
        >
          What's new in NetXMS {{ serverVersion }}
          <i class="pi pi-external-link" />
        </a>
      </div>
    </div>

    <div v-if="VENDOR_MARK_ENABLED" class="about-vendor">
      <img :src="NETXMS_VENDOR.logo" alt="" class="about-vendor-logo" />
      <div>
        <p class="about-vendor-name">Built on NetXMS</p>
        <a
          v-if="changelogLink"
          :href="changelogLink"
          target="_blank"
          rel="noopener noreferrer"
          class="about-changelog"
        >
          What's new in NetXMS {{ serverVersion }}
          <i class="pi pi-external-link" />
        </a>
      </div>
    </div>

    <template #footer>
      <Button label="Close" @click="visible = false" />
    </template>
  </Dialog>
</template>

<style scoped>
.about-body {
  display: flex;
  gap: 1.25rem;
  align-items: flex-start;
}

.about-logo {
  width: 4.5rem;
  height: auto;
  display: block;
}

.about-details {
  flex: 1;
  min-width: 0;
}

.about-product {
  margin: 0;
  font-weight: 600;
}

.about-copyright {
  margin: 0.25rem 0 1rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.about-copyright p {
  margin: 0;
}

.about-facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.35rem 0.75rem;
  margin: 0;
  font-size: 0.8125rem;
}

.about-facts dt {
  color: var(--p-text-muted-color);
  white-space: nowrap;
}

.about-facts dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.about-changelog {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 1rem;
  font-size: 0.8125rem;
  color: var(--p-primary-color);
  text-decoration: none;
}

.about-changelog:hover {
  text-decoration: underline;
}

.about-vendor {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid var(--p-content-border-color);
}

.about-vendor-logo {
  width: 2rem;
  height: auto;
  display: block;
}

.about-vendor-name {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 600;
}

.about-vendor .about-changelog {
  margin-top: 0.25rem;
}

@media (max-width: 480px) {
  .about-body {
    flex-direction: column;
  }
}
</style>
