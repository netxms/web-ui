// XML format reference: the server's src/libnxlp/parser.cpp

function xmlEscape(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function elText(parent, tagName) {
  return parent.querySelector(tagName)?.textContent?.trim() ?? ''
}

function elAttr(el, name, defaultVal = '') {
  return el?.getAttribute(name) ?? defaultVal
}

export function parseXml(xmlString) {
  const model = {
    name: '',
    processAll: false,
    macros: [],
    rules: [],
  }

  if (!xmlString?.trim()) return model

  const doc = new DOMParser().parseFromString(xmlString, 'text/xml')
  if (doc.querySelector('parsererror')) return model

  const parser = doc.documentElement
  if (parser.tagName !== 'parser') return model

  model.name = elAttr(parser, 'name')
  model.processAll = elAttr(parser, 'processAll') === 'true'

  parser.querySelectorAll('macros > macro').forEach((el) => {
    model.macros.push({
      name: elAttr(el, 'name'),
      value: el.textContent?.trim() ?? '',
    })
  })

  parser.querySelectorAll('rules > rule').forEach((el) => {
    const matchEl = el.querySelector('match')
    const eventEl = el.querySelector('event')

    model.rules.push({
      name: elAttr(el, 'name'),
      guid: elAttr(el, 'guid') || crypto.randomUUID(),
      match: matchEl?.textContent?.trim() ?? '',
      matchInvert: elAttr(matchEl, 'invert') === 'true',
      absenceDetection: elAttr(matchEl, 'absence') === 'true',
      absenceInterval: parseInt(elAttr(matchEl, 'absenceInterval', '0')) || 0,
      absenceRealertInterval: parseInt(elAttr(matchEl, 'absenceRealertInterval', '0')) || 0,
      // <tag> is the syslog alias for <source>
      level: elText(el, 'level') || elText(el, 'severity'),
      facility: elText(el, 'facility'),
      id: elText(el, 'id'),
      source: elText(el, 'source') || elText(el, 'tag'),
      logName: elText(el, 'logName'),
      description: elText(el, 'description'),
      event: eventEl?.textContent?.trim() ?? '',
      eventTag: elAttr(eventEl, 'tag'),
      breakOnMatch: elAttr(el, 'break') === 'true',
      doNotSaveToDatabase: elAttr(el, 'doNotSaveToDatabase') === 'true',
    })
  })

  return model
}

export function serializeXml(model) {
  if (!model) return ''

  let xml = '<parser'
  if (model.name) xml += ` name="${xmlEscape(model.name)}"`
  if (model.processAll) xml += ' processAll="true"'
  xml += '>\n'

  if (model.macros.length > 0) {
    xml += '  <macros>\n'
    for (const macro of model.macros) {
      xml += `    <macro name="${xmlEscape(macro.name)}">${xmlEscape(macro.value)}</macro>\n`
    }
    xml += '  </macros>\n'
  }

  if (model.rules.length > 0) {
    xml += '  <rules>\n'
    for (const rule of model.rules) {
      xml += '    <rule'
      if (rule.name) xml += ` name="${xmlEscape(rule.name)}"`
      if (rule.guid) xml += ` guid="${xmlEscape(rule.guid)}"`
      if (rule.breakOnMatch) xml += ' break="true"'
      if (rule.doNotSaveToDatabase) xml += ' doNotSaveToDatabase="true"'
      xml += '>\n'

      if (rule.match || rule.absenceDetection) {
        xml += '      <match'
        if (rule.matchInvert) xml += ' invert="true"'
        if (rule.absenceDetection) {
          xml += ' absence="true"'
          if (rule.absenceInterval) xml += ` absenceInterval="${rule.absenceInterval}"`
          if (rule.absenceRealertInterval) {
            xml += ` absenceRealertInterval="${rule.absenceRealertInterval}"`
          }
        }
        xml += `>${xmlEscape(rule.match)}</match>\n`
      }

      if (rule.source) xml += `      <source>${xmlEscape(rule.source)}</source>\n`
      if (rule.facility) xml += `      <facility>${xmlEscape(rule.facility)}</facility>\n`
      if (rule.id) xml += `      <id>${xmlEscape(rule.id)}</id>\n`
      if (rule.level) xml += `      <level>${xmlEscape(rule.level)}</level>\n`
      if (rule.logName) xml += `      <logName>${xmlEscape(rule.logName)}</logName>\n`
      if (rule.description)
        xml += `      <description>${xmlEscape(rule.description)}</description>\n`

      if (rule.event) {
        xml += '      <event'
        if (rule.eventTag) xml += ` tag="${xmlEscape(rule.eventTag)}"`
        xml += `>${xmlEscape(rule.event)}</event>\n`
      }

      xml += '    </rule>\n'
    }
    xml += '  </rules>\n'
  }

  xml += '</parser>'
  return xml
}

export function duplicateRule(rule) {
  return {
    ...rule,
    guid: crypto.randomUUID(),
    name: rule.name ? `${rule.name} (copy)` : '',
  }
}

export function createEmptyRule() {
  return {
    name: '',
    guid: crypto.randomUUID(),
    match: '',
    matchInvert: false,
    absenceDetection: false,
    absenceInterval: 3600,
    absenceRealertInterval: 0,
    level: '',
    facility: '',
    id: '',
    source: '',
    logName: '',
    description: '',
    event: '',
    eventTag: '',
    breakOnMatch: false,
    doNotSaveToDatabase: false,
  }
}
