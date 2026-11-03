import { describe, it, expect } from 'vitest'
import {
  menuGroups,
  DEFAULT_SECTION,
  visibleGroups,
  hiddenSections,
  isSectionPermitted,
  isSectionAvailable,
  requiredRightForSection,
  requiredComponentForSection,
} from '../configSections'
import { CAN_KEY_TO_RIGHT, labelForRight } from '@/auth/systemRights'
import { SERVER_COMPONENTS, labelForComponent } from '@/config/serverComponents'

const allSections = menuGroups.flatMap((g) => g.items)

const ALL = Object.fromEntries(Object.keys(CAN_KEY_TO_RIGHT).map((k) => [k, true]))
const NONE = Object.fromEntries(Object.keys(CAN_KEY_TO_RIGHT).map((k) => [k, false]))
/** Isolates the permission axis from the component gate. */
const ALL_COMPONENTS = allSections.map((s) => s.requiredComponent).filter(Boolean)

describe('section rights metadata', () => {
  it('names only rights that exist and have a human label', () => {
    const bad = allSections.flatMap((section) => {
      const required = section.requiredRight
      if (!required) return []
      const keys = Array.isArray(required) ? required : [required]
      return keys
        .filter((key) => !(key in CAN_KEY_TO_RIGHT) || !labelForRight(key))
        .map((key) => `${section.id} → ${key}`)
    })
    expect(bad).toEqual([])
  })

  it('leaves the default section readable by every account', () => {
    // The /configuration redirect targets it; a gated default would bounce low-privilege users.
    expect(requiredRightForSection(DEFAULT_SECTION)).toBeNull()
  })

  it('returns null for an unknown section id', () => {
    expect(requiredRightForSection('no-such-section')).toBeNull()
  })

  it('keeps each group alphabetical by label', () => {
    for (const group of menuGroups) {
      const labels = group.items.map((i) => i.label)
      expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)))
    }
  })
})

describe('isSectionPermitted', () => {
  it('permits a section with no requiredRight', () => {
    expect(isSectionPermitted({}, NONE)).toBe(true)
  })

  it('treats an array as any-of', () => {
    const item = { requiredRight: ['manageActions', 'manageEpp'] }
    expect(isSectionPermitted(item, { ...NONE, manageEpp: true })).toBe(true)
    expect(isSectionPermitted(item, { ...NONE, manageActions: true })).toBe(true)
    expect(isSectionPermitted(item, NONE)).toBe(false)
  })

  describe('runtime gates', () => {
    const item = { requiredRight: 'manageEpp', runtimeRight: 'eppChainAccess' }

    it('does not consult the gate when the static right already grants it', () => {
      expect(
        isSectionPermitted(item, { ...NONE, manageEpp: true }, { eppChainAccess: false }),
      ).toBe(true)
    })

    it('grants on the gate alone', () => {
      expect(isSectionPermitted(item, NONE, { eppChainAccess: true })).toBe(true)
    })

    it('hides the section only once the gate has actually answered no', () => {
      expect(isSectionPermitted(item, NONE, { eppChainAccess: false })).toBe(false)
      expect(isSectionPermitted(item, NONE, { eppChainAccess: null })).toBe(true)
      expect(isSectionPermitted(item, NONE, {})).toBe(true)
      expect(isSectionPermitted(item, NONE)).toBe(true)
    })
  })
})

describe('visibleGroups / hiddenSections', () => {
  it('shows everything to a full-privilege account on a fully equipped server', () => {
    expect(visibleGroups(ALL, undefined, ALL_COMPONENTS)).toEqual(menuGroups)
    expect(hiddenSections(ALL, undefined, ALL_COMPONENTS)).toEqual([])
  })

  it('partitions the full set for any account', () => {
    for (const can of [ALL, NONE, { ...NONE, manageEpp: true }]) {
      const visible = visibleGroups(can, undefined, ALL_COMPONENTS).flatMap((g) => g.items)
      expect(visible.length + hiddenSections(can, undefined, ALL_COMPONENTS).length).toBe(
        allSections.length,
      )
    }
  })

  it('drops groups left empty rather than showing a bare heading', () => {
    const groups = visibleGroups(NONE, undefined, ALL_COMPONENTS)
    expect(groups.map((g) => g.label)).not.toContain('System')
    expect(groups.every((g) => g.items.length > 0)).toBe(true)
  })

  it('surfaces a section as soon as its right is granted', () => {
    expect(hiddenSections(NONE, undefined, ALL_COMPONENTS).map((s) => s.id)).toContain(
      'script-library',
    )
    const withScripts = hiddenSections({ ...NONE, manageScripts: true }, undefined, ALL_COMPONENTS)
    expect(withScripts.map((s) => s.id)).not.toContain('script-library')
  })

  it('keeps the ungated sections visible to an account with no rights at all', () => {
    expect(
      visibleGroups(NONE, undefined, ALL_COMPONENTS)
        .flatMap((g) => g.items)
        .map((i) => i.id),
    ).toEqual(['object-tools', 'epp'])

    expect(
      visibleGroups(NONE, { eppChainAccess: false }, ALL_COMPONENTS)
        .flatMap((g) => g.items)
        .map((i) => i.id),
    ).toEqual(['object-tools'])
  })

  it('keeps AI Assistant visible on a server with no AI assistant', () => {
    const ids = visibleGroups(ALL, undefined, []).flatMap((g) => g.items.map((i) => i.id))
    expect(ids).toContain('ai-assistant')
  })

  it('keeps a missing component out of the permissions disclosure', () => {
    const gated = { id: 'x', requiredComponent: SERVER_COMPONENTS.AI_ASSISTANT }
    expect(hiddenSections(ALL, undefined, [])).not.toContainEqual(gated)
    expect(isSectionAvailable(gated, [])).toBe(false)
  })

  it('leaves a runtime-gated section navigable, so its own view can explain the refusal', () => {
    expect(requiredRightForSection('epp')).toBeNull()
  })
})

describe('isSectionAvailable', () => {
  const gated = { requiredComponent: SERVER_COMPONENTS.AI_ASSISTANT }

  it('permits a section with no requiredComponent, whatever the server reports', () => {
    expect(isSectionAvailable({}, [])).toBe(true)
    expect(isSectionAvailable({}, undefined)).toBe(true)
  })

  it('permits a gated section only when the server registered the component', () => {
    expect(isSectionAvailable(gated, [SERVER_COMPONENTS.AI_ASSISTANT])).toBe(true)
    expect(isSectionAvailable(gated, ['CORE'])).toBe(false)
  })

  it('treats an unresolved component list as unavailable', () => {
    // Inverse of the permission convention: offering the assistant on a server with no LLM
    // provider crashes netxmsd on the first message.
    expect(isSectionAvailable(gated, undefined)).toBe(false)
    expect(isSectionAvailable(gated, null)).toBe(false)
    expect(isSectionAvailable(gated, [])).toBe(false)
  })
})

describe('section component metadata', () => {
  it('names only components that exist and have a human label', () => {
    const known = new Set(Object.values(SERVER_COMPONENTS))
    const bad = allSections
      .filter((s) => s.requiredComponent && !known.has(s.requiredComponent))
      .map((s) => `${s.id} → ${s.requiredComponent}`)
    expect(bad).toEqual([])
    for (const section of allSections.filter((s) => s.requiredComponent)) {
      expect(labelForComponent(section.requiredComponent)).not.toBe(section.requiredComponent)
    }
  })

  it('reports no component for any section today, including AI Assistant', () => {
    expect(allSections.filter((s) => s.requiredComponent)).toEqual([])
    expect(requiredComponentForSection('ai-assistant')).toBeNull()
    expect(requiredComponentForSection(DEFAULT_SECTION)).toBeNull()
    expect(requiredComponentForSection('no-such-section')).toBeNull()
  })
})
