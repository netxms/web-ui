import { describe, it, expect } from 'vitest'
import { parseXml, serializeXml, createEmptyRule, duplicateRule } from '@/utils/logParserXml'

const XML = `<parser name="Main" processAll="true">
  <macros>
    <macro name="USER">[a-z]+</macro>
  </macros>
  <rules>
    <rule name="Login failure" guid="g-1" break="true">
      <match invert="true">login failure for @{USER}</match>
      <source>system</source>
      <facility>1</facility>
      <level>0x8</level>
      <event tag="auth">SYSLOG_LOGIN_FAILURE</event>
    </rule>
  </rules>
</parser>`

describe('logParserXml', () => {
  it('reads the parser, its macros and rules', () => {
    const model = parseXml(XML)
    expect(model.name).toBe('Main')
    expect(model.processAll).toBe(true)
    expect(model.macros).toEqual([{ name: 'USER', value: '[a-z]+' }])
    expect(model.rules).toHaveLength(1)
    expect(model.rules[0]).toMatchObject({
      name: 'Login failure',
      guid: 'g-1',
      match: 'login failure for @{USER}',
      matchInvert: true,
      source: 'system',
      facility: '1',
      level: '0x8',
      event: 'SYSLOG_LOGIN_FAILURE',
      eventTag: 'auth',
      breakOnMatch: true,
    })
  })

  it('writes back what it read', () => {
    expect(parseXml(serializeXml(parseXml(XML)))).toEqual(parseXml(XML))
  })

  describe('duplicateRule', () => {
    it('copies every setting under a new GUID and marks the name as a copy', () => {
      const rule = parseXml(XML).rules[0]
      const copy = duplicateRule(rule)
      expect(copy.guid).not.toBe(rule.guid)
      expect(copy.name).toBe('Login failure (copy)')
      expect({ ...copy, guid: rule.guid, name: rule.name }).toEqual(rule)
    })

    it('leaves an unnamed rule unnamed', () => {
      expect(duplicateRule(createEmptyRule()).name).toBe('')
    })
  })
})
