<script setup></script>

<template>
  <div class="auth-layout">
    <router-view />
  </div>
</template>

<style scoped>
.auth-layout {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  /* A brand may paint the sign-in page (for example a gradient behind the card). */
  background: var(--app-login-bg, var(--p-surface-ground));
}
</style>
