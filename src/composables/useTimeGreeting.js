import { computed } from 'vue'

export function useTimeGreeting() {
  const greeting = computed(() => {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 12) return 'Good morning'
    if (hour >= 12 && hour < 17) return 'Good afternoon'
    return 'Good evening'
  })

  return { greeting }
}
