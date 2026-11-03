import { describe, it, expect } from 'vitest'
import { dciChoiceFor } from '../objectDeletion'

const template = (name) => ({ class: 'Template', name })
const cluster = (name, children) => ({ class: 'Cluster', name, children })

describe('dciChoiceFor', () => {
  it('asks about a single template by name', () => {
    expect(dciChoiceFor([template('Linux')])).toEqual({ kind: 'template', name: 'Linux' })
  })

  it('words several templates as a group', () => {
    expect(dciChoiceFor([template('Linux'), template('Windows')])).toEqual({
      kind: 'template',
      name: 'multiple templates',
    })
  })

  it('lets a template win over a cluster, as legacy does', () => {
    const choice = dciChoiceFor([cluster('DB', [{ class: 'Node' }]), template('Linux')])
    expect(choice.kind).toBe('template')
  })

  it('asks about a cluster with a node member', () => {
    expect(dciChoiceFor([cluster('DB', [{ class: 'Node' }])])).toEqual({
      kind: 'cluster',
      name: 'DB',
    })
  })

  it('does not ask about a cluster with no members', () => {
    expect(dciChoiceFor([cluster('Empty', [])])).toBeNull()
  })

  it('asks about a cluster whose children are not known', () => {
    expect(dciChoiceFor([cluster('DB', [{ id: 5 }])])?.kind).toBe('cluster')
    expect(dciChoiceFor([cluster('DB', undefined)])?.kind).toBe('cluster')
  })

  it('does not ask for a selection with neither', () => {
    expect(dciChoiceFor([{ class: 'Container', name: 'Servers' }, { class: 'Node' }])).toBeNull()
  })
})
