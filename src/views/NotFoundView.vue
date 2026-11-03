<script setup>
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div class="not-found-view">
    <div class="not-found-content">
      <h1>Page Not Found</h1>
      <p>
        The page <code>{{ route.path }}</code> does not exist.
      </p>
      <RouterLink to="/home" class="back-link">Go to Home</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.not-found-view {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}

.not-found-content {
  text-align: center;
}

.not-found-content h1 {
  font-size: 2rem;
  font-weight: 700;
  margin: 0 0 0.75rem;
}

.not-found-content p {
  color: var(--p-text-muted-color);
  margin: 0 0 1.5rem;
}

.not-found-content code {
  background: var(--p-content-hover-background);
  padding: 0.15rem 0.4rem;
  border-radius: var(--p-border-radius-sm);
  font-size: 0.9em;
}

.back-link {
  color: var(--p-primary-color);
  text-decoration: none;
  font-weight: 500;
}

.back-link:hover {
  text-decoration: underline;
}
</style>
