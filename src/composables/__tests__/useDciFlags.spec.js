import { describe, it, expect } from 'vitest'
import { reactive } from 'vue'
import { useDciFlags } from '@/composables/useDciFlags'

describe('useDciFlags', () => {
  it('maps templateOverride to DCF_TEMPLATE_OVERRIDE (0x400000), leaving other bits alone', () => {
    // store changes only (0x40000) + MIB enum (0x100000) + an unmapped bit (0x200000)
    const form = reactive({ flags: 0x340000 })
    const flags = useDciFlags(form)
    expect(flags.templateOverride.value).toBe(false)

    flags.templateOverride.value = true
    expect(form.flags).toBe(0x740000)
    expect(flags.storeChangesOnly.value).toBe(true)

    flags.templateOverride.value = false
    expect(form.flags).toBe(0x340000)
  })

  it('treats a missing flags field as zero', () => {
    const form = reactive({})
    const flags = useDciFlags(form)
    expect(flags.templateOverride.value).toBe(false)
    flags.templateOverride.value = true
    expect(form.flags).toBe(0x400000)
  })
})
