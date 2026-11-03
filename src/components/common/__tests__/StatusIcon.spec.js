import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusIcon from '@/components/common/StatusIcon.vue'

const icon = (props) => mount(StatusIcon, { props }).find('svg')

describe('StatusIcon', () => {
  it('draws one shape per status code', () => {
    const shapes = [
      'lucide-circle-check',
      'lucide-info',
      'lucide-triangle-alert',
      'lucide-diamond-alert',
      'lucide-octagon-x',
      'lucide-square-question-mark',
      'lucide-circle-minus',
      'lucide-ban',
      'lucide-flask-conical',
    ]
    shapes.forEach((shape, code) => {
      expect(icon({ status: code }).classes()).toContain(shape)
    })
  })

  it('colors the icon with the status palette fill', () => {
    expect(icon({ status: 1 }).attributes('style')).toContain('var(--netxms-status-warning)')
    expect(icon({ status: 7 }).attributes('style')).toContain('var(--netxms-status-disabled)')
    expect(icon({ status: 8 }).attributes('style')).toContain('var(--netxms-status-testing)')
  })

  it('takes the text color inside a status chip', () => {
    expect(icon({ status: 1, tone: 'text' }).attributes('style')).toContain(
      'var(--netxms-status-warning-text)',
    )
  })

  it('accepts the palette key that normalizeSeverity returns', () => {
    expect(icon({ status: 'major' }).classes()).toContain('lucide-diamond-alert')
    expect(icon({ status: 'Critical' }).classes()).toContain('lucide-octagon-x')
  })

  it('renders anything unrecognized as Unknown', () => {
    for (const status of [9, -1, 'bogus']) {
      const svg = icon({ status })
      expect(svg.classes()).toContain('lucide-square-question-mark')
      expect(svg.attributes('style')).toContain('var(--netxms-status-unknown)')
    }
  })

  it('follows the font size by default and takes an explicit size', () => {
    expect(icon({ status: 0 }).attributes('width')).toBe('1em')
    expect(icon({ status: 0, size: '1rem' }).attributes('height')).toBe('1rem')
  })
})
