import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FormField from '@/components/common/FormField.vue'

// Bare-input components take `id`, wrapper-rooted ones take `inputId`.
function mountField(props = {}, slot = '<input :id="params.id" />') {
  return mount(FormField, {
    props,
    slots: {
      default: `<template #default="params">${slot}</template>`,
    },
  })
}

describe('FormField', () => {
  describe('label association', () => {
    it('points the label at the id it hands to the slot', () => {
      const wrapper = mountField({ label: 'Origin' })

      const id = wrapper.get('input').attributes('id')
      expect(id).toBeTruthy()
      expect(wrapper.get('label').attributes('for')).toBe(id)
    })

    // `useId` counts per app instance, so both fields must be in one tree.
    it('gives each instance its own id, so two fields on a form do not collide', () => {
      const form = mount({
        components: { FormField },
        template: `
          <form>
            <FormField label="One" v-slot="{ id }"><input :id="id" /></FormField>
            <FormField label="Two" v-slot="{ id }"><input :id="id" /></FormField>
          </form>`,
      })

      const [a, b] = form.findAll('input').map((i) => i.attributes('id'))
      const [forA, forB] = form.findAll('label').map((l) => l.attributes('for'))

      expect(a).not.toBe(b)
      expect(forA).toBe(a)
      expect(forB).toBe(b)
    })

    it('renders no label element at all when there is no label text', () => {
      expect(mountField().find('label').exists()).toBe(false)
    })
  })

  describe('group mode', () => {
    it('names the field with aria-labelledby instead of a for/id pair', () => {
      const wrapper = mountField({ label: 'Options', group: true })

      const root = wrapper.get('.form-field')
      expect(root.attributes('role')).toBe('group')
      expect(wrapper.find('label').exists()).toBe(false)

      const caption = wrapper.get('.form-field__label')
      expect(caption.element.tagName).toBe('SPAN')
      expect(root.attributes('aria-labelledby')).toBe(caption.attributes('id'))
    })

    it('claims no group role when it has no label to name one with', () => {
      expect(mountField({ group: true }).get('.form-field').attributes('role')).toBe('group')
      expect(
        mountField({ group: true }).get('.form-field').attributes('aria-labelledby'),
      ).toBeUndefined()
    })
  })

  describe('required and empty', () => {
    it('marks the control only while a required field is actually blank', () => {
      expect(mountField({ label: 'Name', required: true, empty: true }).classes()).toContain(
        'form-field--required-empty',
      )

      expect(mountField({ label: 'Name', required: true, empty: false }).classes()).not.toContain(
        'form-field--required-empty',
      )
    })

    it('does not mark an optional field that happens to be blank', () => {
      expect(mountField({ label: 'Alias', empty: true }).classes()).not.toContain(
        'form-field--required-empty',
      )
    })

    it('hides the required asterisk from assistive tech', () => {
      const star = mountField({ label: 'Name', required: true }).get('.form-field__required')
      expect(star.attributes('aria-hidden')).toBe('true')
    })
  })

  describe('hint and error', () => {
    it('offers describedBy only when there is something to describe', () => {
      const plain = mountField({ label: 'X' }, '<input :aria-describedby="params.describedBy" />')
      expect(plain.get('input').attributes('aria-describedby')).toBeUndefined()

      const hinted = mountField(
        { label: 'X', hint: 'Seconds' },
        '<input :aria-describedby="params.describedBy" />',
      )
      expect(hinted.get('input').attributes('aria-describedby')).toBe(
        hinted.get('.form-field__hint').attributes('id'),
      )
    })

    it('replaces the hint with the error rather than stacking them', () => {
      const wrapper = mountField({ label: 'X', hint: 'Seconds', error: 'Too large' })

      expect(wrapper.find('.form-field__hint').exists()).toBe(false)
      const error = wrapper.get('.form-field__error')
      expect(error.text()).toBe('Too large')
      expect(error.attributes('role')).toBe('alert')
    })
  })
})
