// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  communicationPatch,
  isValidHostName,
  isValidUnicastAddress,
} from '@/utils/nodeCommunication'

function node(overrides = {}) {
  return {
    class: 'Node',
    primaryName: '10.0.0.1',
    ssh: { port: 22, proxy: 0, keyId: 0, login: 'netxms', password: 'secret' },
    vnc: { port: 5900, proxy: 0, password: '' },
    modbus: { tcpPort: 502, unitId: 255, proxy: 0 },
    etherNetIp: { address: null, port: 44818, proxy: 0 },
    netconf: { port: 830, proxy: 0 },
    icmp: { proxy: 0, statCollectionMode: 'default', targets: ['10.0.0.2'] },
    mqttProxy: 0,
    syslogCodepage: '',
    externalGateway: false,
    webServiceProxy: 0,
    ...overrides,
  }
}

const clone = (o) => JSON.parse(JSON.stringify(o))

describe('communicationPatch', () => {
  it('is empty when nothing changed', () => {
    const orig = node()
    expect(communicationPatch(clone(orig), orig)).toEqual({})
  })

  it('sends only the changed members of a group, as the server merge-patches it', () => {
    const orig = node()
    const draft = clone(orig)
    draft.ssh.port = 2222
    draft.netconf.proxy = 15
    expect(communicationPatch(draft, orig)).toEqual({ ssh: { port: 2222 }, netconf: { proxy: 15 } })
  })

  it('leaves an untouched password out, so a value the caller never saw is kept', () => {
    const orig = node({ ssh: { port: 22, proxy: 0, keyId: 0, login: '', password: '' } })
    const draft = clone(orig)
    draft.ssh.keyId = 3
    expect(communicationPatch(draft, orig)).toEqual({ ssh: { keyId: 3 } })
  })

  it('clears credentials and the EtherNet/IP address with null', () => {
    const orig = node({ etherNetIp: { address: '10.0.0.5', port: 44818, proxy: 0 } })
    const draft = clone(orig)
    draft.ssh.login = '  '
    draft.ssh.password = ''
    draft.etherNetIp.address = null
    expect(communicationPatch(draft, orig)).toEqual({
      ssh: { login: null, password: null },
      etherNetIp: { address: null },
    })
  })

  it('trims the SSH login', () => {
    const orig = node()
    const draft = clone(orig)
    draft.ssh.login = ' admin '
    expect(communicationPatch(draft, orig)).toEqual({ ssh: { login: 'admin' } })
  })

  it('replaces the whole ICMP target list when it changed', () => {
    const orig = node()
    const draft = clone(orig)
    draft.icmp.targets = ['10.0.0.2', '10.0.0.3']
    draft.icmp.statCollectionMode = 'on'
    expect(communicationPatch(draft, orig)).toEqual({
      icmp: { statCollectionMode: 'on', targets: ['10.0.0.2', '10.0.0.3'] },
    })
  })

  it('sends the single fields at the top level, an empty codepage as null', () => {
    const orig = node({ syslogCodepage: 'UTF-8' })
    const draft = clone(orig)
    draft.externalGateway = true
    draft.mqttProxy = 7
    draft.webServiceProxy = 8
    draft.syslogCodepage = ' '
    expect(communicationPatch(draft, orig)).toEqual({
      externalGateway: true,
      mqttProxy: 7,
      webServiceProxy: 8,
      syslogCodepage: null,
    })
  })

  it('never carries primaryName, which needs a request of its own', () => {
    const orig = node()
    expect(communicationPatch({ ...clone(orig), primaryName: 'host.example.com' }, orig)).toEqual(
      {},
    )
  })

  it('covers the chassis controller and a sensor unit ID', () => {
    const chassis = { class: 'Chassis', controllerId: 0, bindUnderController: false }
    expect(
      communicationPatch({ ...chassis, controllerId: 12, bindUnderController: true }, chassis),
    ).toEqual({ controllerId: 12, bindUnderController: true })

    const sensor = { class: 'Sensor', modbus: { unitId: 255 } }
    expect(communicationPatch({ class: 'Sensor', modbus: { unitId: 4 } }, sensor)).toEqual({
      modbus: { unitId: 4 },
    })
  })

  it('sends nothing for a class without these fields', () => {
    const container = { class: 'Container', name: 'x' }
    expect(communicationPatch({ ...container, name: 'y' }, container)).toEqual({})
  })
})

describe('isValidHostName', () => {
  it.each([
    ['host.example.com', true],
    ['10.0.0.1', true],
    ['fe80::1', true],
    ['0.0.0.0', true],
    ['bad host', false],
    ['', false],
    ['host..com', false],
  ])('%j is %s', (name, valid) => {
    expect(isValidHostName(name)).toBe(valid)
  })
})

describe('isValidUnicastAddress', () => {
  it.each([
    ['10.0.0.1', true],
    [' 192.168.1.20 ', true],
    ['2001:db8::1', true],
    ['0.0.0.0', false],
    ['255.255.255.255', false],
    ['224.0.0.5', false],
    ['::', false],
    ['ff02::1', false],
    ['10.0.0.256', false],
    ['host.example.com', false],
    ['', false],
  ])('%j is %s', (text, valid) => {
    expect(isValidUnicastAddress(text)).toBe(valid)
  })
})
