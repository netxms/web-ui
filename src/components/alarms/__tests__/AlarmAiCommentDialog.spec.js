import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import PrimeVue from 'primevue/config'
import AlarmAiCommentDialog from '../AlarmAiCommentDialog.vue'
import { requestAlarmAiComment, createAlarmComment } from '@/api/alarmsApi'
import { notifyAction } from '@/utils/notify'

const toastAdd = vi.fn()

vi.mock('@/api/alarmsApi', () => ({
  requestAlarmAiComment: vi.fn(),
  createAlarmComment: vi.fn(),
}))
vi.mock('@/utils/notify', () => ({ notifyAction: vi.fn(), notify: vi.fn() }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: toastAdd }) }))
// CodeMirror does not run in jsdom; a textarea stands in, reporting the mode it opened in.
vi.mock('@/components/common/MarkdownCommentEditor.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    __esModule: true,
    default: defineComponent({
      props: ['modelValue', 'initialMode', 'fill'],
      emits: ['update:modelValue'],
      methods: {
        focus() {
          this.$el.focus()
        },
      },
      template: `<textarea
        :value="modelValue"
        :data-mode="initialMode"
        @input="$emit('update:modelValue', $event.target.value)"
      />`,
    }),
  }
})

const ALARM = { id: 7, message: 'Disk almost full on /var', source: 12 }

/** A promise the test settles, standing in for a slow request. */
function pending() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function apiError(status, message = `Request failed: ${status}`) {
  return Object.assign(new Error(message), { status })
}

let wrapper

async function mountDialog(props = {}) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  wrapper = mount(AlarmAiCommentDialog, {
    props: { visible: true, alarm: ALARM, sourceName: 'db-03', ...props },
    attachTo: document.body,
    global: { plugins: [PrimeVue, [VueQueryPlugin, { queryClient }]] },
  })
  await flushPromises()
  return wrapper
}

const body = () => document.body.textContent
const button = (label) =>
  [...document.querySelectorAll('.p-dialog button')].find((b) => b.textContent.trim() === label)
const textarea = () => document.querySelector('.p-dialog textarea')

async function typeComment(text) {
  textarea().value = text
  textarea().dispatchEvent(new Event('input'))
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
})

describe('AlarmAiCommentDialog', () => {
  it('asks about the alarm as it opens, and waits with Cancel', async () => {
    requestAlarmAiComment.mockReturnValue(pending().promise)
    await mountDialog()

    expect(requestAlarmAiComment).toHaveBeenCalledWith(7, { signal: expect.any(AbortSignal) })
    expect(body()).toContain('db-03')
    expect(body()).toContain('Disk almost full on /var')
    expect(body()).toContain('Querying AI assistant')
    expect(button('Cancel')).toBeTruthy()
    expect(textarea()).toBeNull()
  })

  it('shows the answer for editing and saves the trimmed text as a comment', async () => {
    requestAlarmAiComment.mockResolvedValue({ comment: 'Free space on /var.' })
    createAlarmComment.mockResolvedValue({ id: 1 })
    await mountDialog()

    expect(textarea().value).toBe('Free space on /var.')
    expect(textarea().dataset.mode).toBe('preview')
    expect(document.activeElement).toBe(textarea())
    await typeComment('  Free space on /var, then resolve.\n')
    button('Save comment').click()
    await flushPromises()

    expect(createAlarmComment).toHaveBeenCalledWith(7, 'Free space on /var, then resolve.')
    expect(wrapper.emitted('update:visible')).toEqual([[false]])
    expect(notifyAction).toHaveBeenCalledWith('Comment added', 'pi pi-comment')
  })

  it('saves nothing when the text is cleared', async () => {
    requestAlarmAiComment.mockResolvedValue({ comment: 'Free space on /var.' })
    await mountDialog()

    await typeComment('   \n ')

    expect(button('Save comment').disabled).toBe(true)
  })

  it('Discard closes without saving', async () => {
    requestAlarmAiComment.mockResolvedValue({ comment: 'Free space on /var.' })
    await mountDialog()

    button('Discard').click()
    await flushPromises()

    expect(wrapper.emitted('update:visible')).toEqual([[false]])
    expect(createAlarmComment).not.toHaveBeenCalled()
  })

  it('drops the request when closed, so a late answer never shows', async () => {
    const first = pending()
    const second = pending()
    requestAlarmAiComment.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    await mountDialog()
    const { signal } = requestAlarmAiComment.mock.calls[0][1]

    button('Cancel').click()
    expect(wrapper.emitted('update:visible')).toEqual([[false]])
    await wrapper.setProps({ visible: false })
    expect(signal.aborted).toBe(true)

    await wrapper.setProps({ visible: true })
    first.resolve({ comment: 'Stale answer' })
    await flushPromises()
    expect(body()).toContain('Querying AI assistant')
    expect(textarea()).toBeNull()

    second.resolve({ comment: 'Fresh answer' })
    await flushPromises()
    expect(textarea().value).toBe('Fresh answer')
  })

  it('explains a 503 and asks again on Try again', async () => {
    requestAlarmAiComment
      .mockRejectedValueOnce(apiError(503, 'AI assistant is not available'))
      .mockResolvedValueOnce({ comment: 'Second try' })
    await mountDialog()

    expect(body()).toContain('The AI assistant is not available.')
    button('Try again').click()
    await flushPromises()

    expect(requestAlarmAiComment).toHaveBeenCalledTimes(2)
    expect(textarea().value).toBe('Second try')
  })

  it('names the right on a 403 and offers no retry', async () => {
    requestAlarmAiComment.mockRejectedValue(apiError(403, 'Access denied'))
    await mountDialog()

    expect(body()).toContain('"Use AI assistant" system right')
    expect(button('Try again')).toBeUndefined()
    expect(button('Close')).toBeTruthy()
  })

  it('offers no retry for an alarm that is gone', async () => {
    requestAlarmAiComment.mockRejectedValue(apiError(404))
    await mountDialog()

    expect(body()).toContain('This alarm no longer exists.')
    expect(button('Try again')).toBeUndefined()
  })

  it('shows any other failure with its message', async () => {
    requestAlarmAiComment.mockRejectedValue(apiError(0, 'Network error'))
    await mountDialog()

    expect(body()).toContain('Cannot query AI assistant')
    expect(body()).toContain('Network error')
    expect(button('Try again')).toBeTruthy()
  })

  it('stays open when the comment cannot be saved', async () => {
    requestAlarmAiComment.mockResolvedValue({ comment: 'Free space on /var.' })
    createAlarmComment.mockRejectedValue(apiError(403, 'Access denied'))
    await mountDialog()

    button('Save comment').click()
    await flushPromises()

    expect(wrapper.emitted('update:visible')).toBeUndefined()
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error', summary: 'Failed to save comment' }),
    )
    expect(textarea().value).toBe('Free space on /var.')
  })
})
