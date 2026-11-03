import { describe, it, expect } from 'vitest'
import {
  namespaceOf,
  namespacesOf,
  isDefaultValue,
  valueForDisplay,
  currentValueForDisplay,
  defaultValueForDisplay,
  UNGROUPED_NAMESPACE,
} from '../serverConfigDisplay'

function variable(overrides = {}) {
  return {
    name: 'Test.Variable',
    value: '',
    defaultValue: '',
    dataType: 'STRING',
    description: '',
    units: '',
    needServerRestart: false,
    possibleValues: [],
    ...overrides,
  }
}

describe('namespaceOf', () => {
  it('takes everything before the first dot', () => {
    expect(namespaceOf('Objects.Nodes.SyncInterval')).toBe('Objects')
    expect(namespaceOf('SNMP.Traps.ProcessUnmanaged')).toBe('SNMP')
  })

  it('groups undotted names under the catch-all', () => {
    expect(namespaceOf('DBLockStatus')).toBe(UNGROUPED_NAMESPACE)
    expect(namespaceOf('EnableISCListener')).toBe(UNGROUPED_NAMESPACE)
  })

  it('treats a leading dot as no namespace rather than an empty one', () => {
    expect(namespaceOf('.hidden')).toBe(UNGROUPED_NAMESPACE)
  })

  it('survives a missing name', () => {
    expect(namespaceOf(undefined)).toBe(UNGROUPED_NAMESPACE)
  })
})

describe('namespacesOf', () => {
  it('counts per namespace and sorts alphabetically', () => {
    const list = namespacesOf([
      variable({ name: 'SNMP.A' }),
      variable({ name: 'Objects.A' }),
      variable({ name: 'Objects.B' }),
    ])
    expect(list).toEqual([
      { name: 'Objects', count: 2 },
      { name: 'SNMP', count: 1 },
    ])
  })

  it('sorts the catch-all last regardless of alphabet', () => {
    const list = namespacesOf([
      variable({ name: 'Zone.A' }),
      variable({ name: 'DBLockStatus' }),
      variable({ name: 'Agent.A' }),
    ])
    expect(list.map((n) => n.name)).toEqual(['Agent', 'Zone', UNGROUPED_NAMESPACE])
  })

  it('returns nothing for an empty or missing list', () => {
    expect(namespacesOf([])).toEqual([])
    expect(namespacesOf(undefined)).toEqual([])
  })
})

describe('isDefaultValue', () => {
  it('compares value against defaultValue', () => {
    expect(isDefaultValue(variable({ value: '60', defaultValue: '60' }))).toBe(true)
    expect(isDefaultValue(variable({ value: '120', defaultValue: '60' }))).toBe(false)
  })

  it('treats a variable with no default as modified, since there is nothing to reset to', () => {
    expect(isDefaultValue(variable({ value: 'custom', defaultValue: '' }))).toBe(false)
  })
})

describe('valueForDisplay', () => {
  it('masks passwords', () => {
    expect(currentValueForDisplay(variable({ dataType: 'PASSWORD', value: 'hunter2' }))).toBe(
      '********',
    )
  })

  it('renders booleans as true/false', () => {
    expect(currentValueForDisplay(variable({ dataType: 'BOOLEAN', value: '1' }))).toBe('true')
    expect(currentValueForDisplay(variable({ dataType: 'BOOLEAN', value: '0' }))).toBe('false')
  })

  it('falls back to false for an unparseable boolean, as the Java client does', () => {
    expect(currentValueForDisplay(variable({ dataType: 'BOOLEAN', value: 'maybe' }))).toBe('false')
  })

  it('replaces a choice code with its description', () => {
    const v = variable({
      dataType: 'CHOICE',
      value: '2',
      possibleValues: [
        { value: '1', description: 'Never' },
        { value: '2', description: 'Always' },
      ],
    })
    expect(currentValueForDisplay(v)).toBe('Always')
  })

  it('keeps the raw code when the choice has no matching description', () => {
    const v = variable({ dataType: 'CHOICE', value: '7', possibleValues: [] })
    expect(currentValueForDisplay(v)).toBe('7')
  })

  it('appends units to integers, and only when units are set', () => {
    expect(
      currentValueForDisplay(variable({ dataType: 'INTEGER', value: '300', units: 'seconds' })),
    ).toBe('300 seconds')
    expect(currentValueForDisplay(variable({ dataType: 'INTEGER', value: '300' }))).toBe('300')
  })

  it('renders an empty value as empty for every type', () => {
    expect(currentValueForDisplay(variable({ dataType: 'PASSWORD', value: '' }))).toBe('')
    expect(currentValueForDisplay(variable({ dataType: 'BOOLEAN', value: '' }))).toBe('')
  })

  it('renders the default value with the same rules as the current one', () => {
    const v = variable({ dataType: 'BOOLEAN', value: '1', defaultValue: '0' })
    expect(currentValueForDisplay(v)).toBe('true')
    expect(defaultValueForDisplay(v)).toBe('false')
  })

  it('passes strings through untouched', () => {
    expect(valueForDisplay(variable(), 'plain text')).toBe('plain text')
  })
})
