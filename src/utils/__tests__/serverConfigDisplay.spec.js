// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  namespaceOf,
  namespacesOf,
  isDefaultValue,
  valueForDisplay,
  currentValueForDisplay,
  defaultValueForDisplay,
  sortedPossibleValues,
  SECRET_PLACEHOLDER,
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

  it('reads an unset secret as default and a set one as modified', () => {
    const secret = (value) => variable({ dataType: 'PASSWORD', value, defaultValue: '' })
    expect(isDefaultValue(secret(''))).toBe(true)
    expect(isDefaultValue(secret(SECRET_PLACEHOLDER))).toBe(false)
  })
})

describe('valueForDisplay', () => {
  it('masks passwords', () => {
    expect(currentValueForDisplay(variable({ dataType: 'PASSWORD', value: 'hunter2' }))).toBe(
      '********',
    )
  })

  it('shows the placeholder of a set secret masked, and an unset one as empty', () => {
    const secret = (value) => variable({ dataType: 'PASSWORD', value })
    expect(currentValueForDisplay(secret(SECRET_PLACEHOLDER))).toBe('********')
    expect(currentValueForDisplay(secret(''))).toBe('')
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

describe('sortedPossibleValues', () => {
  const option = (value) => ({ value, description: `d${value}` })

  // Objects.StatusCalculation.Shift, in the order an index on var_value returns it.
  it('sorts integer choices numerically', () => {
    const values = ['-1', '-2', '-3', '-4', '0', '1', '2', '3', '4'].map(option)
    expect(sortedPossibleValues(values).map((v) => v.value)).toEqual([
      '-4',
      '-3',
      '-2',
      '-1',
      '0',
      '1',
      '2',
      '3',
      '4',
    ])
  })

  it('keeps the server order when any choice is not an integer', () => {
    const values = ['b', '2', 'a'].map(option)
    expect(sortedPossibleValues(values).map((v) => v.value)).toEqual(['b', '2', 'a'])
  })

  it('does not reorder its input', () => {
    const values = ['2', '1'].map(option)
    sortedPossibleValues(values)
    expect(values.map((v) => v.value)).toEqual(['2', '1'])
  })

  it('returns nothing for a missing list', () => {
    expect(sortedPossibleValues(undefined)).toEqual([])
  })
})
