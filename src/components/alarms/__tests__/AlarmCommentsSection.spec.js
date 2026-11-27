import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import PrimeVue from 'primevue/config'
import AlarmCommentsSection from '../AlarmCommentsSection.vue'

const comments = ref([])
const createComment = vi.fn()
const updateComment = vi.fn()

vi.mock('@/queries/useAlarmQueries', () => ({
  useAlarmComments: () => ({
    data: comments,
    isLoading: ref(false),
    isError: ref(false),
    error: ref(null),
    refetch: vi.fn(),
  }),
  useCreateAlarmComment: () => ({ mutateAsync: createComment, isPending: ref(false) }),
  useUpdateAlarmComment: () => ({ mutateAsync: updateComment, isPending: ref(false) }),
  useDeleteAlarmComment: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
// CodeMirror does not run in jsdom; a textarea stands in.
vi.mock('@/components/common/MarkdownCommentEditor.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    __esModule: true,
    default: defineComponent({
      props: ['modelValue', 'placeholder', 'fill'],
      emits: ['update:modelValue'],
      methods: {
        focus() {
          this.$el.focus()
        },
      },
      template: `<textarea
        :value="modelValue"
        @input="$emit('update:modelValue', $event.target.value)"
      />`,
    }),
  }
})

let wrapper

async function mountSection() {
  wrapper = mount(AlarmCommentsSection, {
    props: { alarmId: 5 },
    attachTo: document.body,
    global: { plugins: [PrimeVue] },
  })
  await flushPromises()
  return wrapper
}

const dialogButton = (label) =>
  [...document.querySelectorAll('.p-dialog button')].find((b) => b.textContent.trim() === label)
const editor = () => document.querySelector('.p-dialog textarea')

beforeEach(() => {
  vi.clearAllMocks()
  comments.value = [
    {
      id: 1,
      userName: 'admin',
      lastChangeTime: '2026-11-27T17:38:00Z',
      text: '**Why it fails**\n- the pool is full\n\nline one\nline two',
    },
  ]
})

afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
})

describe('AlarmCommentsSection', () => {
  it('renders comments as markdown, keeping single line breaks', async () => {
    const text = (await mountSection()).find('.comment-text')

    expect(text.find('strong').text()).toBe('Why it fails')
    expect(text.find('li').text()).toBe('the pool is full')
    expect(text.html()).toContain('line one<br>')
  })

  it('edits a comment as markdown source, in the shared editor', async () => {
    updateComment.mockResolvedValue({})
    const section = await mountSection()

    await section.find('button[aria-label="Edit comment"]').trigger('click')
    await flushPromises()
    expect(editor().value).toBe(comments.value[0].text)
    expect(document.activeElement).toBe(editor())

    editor().value = '  **Fixed** by raising the pool size.  '
    editor().dispatchEvent(new Event('input'))
    await flushPromises()
    dialogButton('Save').click()
    await flushPromises()

    expect(updateComment).toHaveBeenCalledWith({
      alarmId: 5,
      commentId: 1,
      text: '**Fixed** by raising the pool size.',
    })
  })
})
