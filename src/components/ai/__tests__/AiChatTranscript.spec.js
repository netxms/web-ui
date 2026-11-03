import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import AiChatTranscript from '@/components/ai/AiChatTranscript.vue'

const QUESTION = {
  id: 7,
  type: 'confirmation',
  confirmationType: 2,
  text: 'Restart the agent?',
  context: '',
  expiresAt: 0,
}

function mountTranscript(props) {
  return mount(AiChatTranscript, {
    props: { messages: [], isThinking: true, ...props },
    global: { plugins: [PrimeVue] },
  })
}

afterEach(() => {
  vi.useRealTimers()
})

describe('AiChatTranscript', () => {
  it('names the function the assistant is running', () => {
    const wrapper = mountTranscript({ currentFunction: 'get-alarm-list' })
    expect(wrapper.find('.ai-thinking-label').text()).toBe('Getting alarm list...')
  })

  it('labels the answer buttons by the question type', async () => {
    const wrapper = mountTranscript({ pendingQuestion: QUESTION })
    const buttons = wrapper.findAll('.ai-question-options button')

    expect(buttons.map((b) => b.text())).toEqual(['Confirm', 'Cancel'])
    await buttons[1].trigger('click')
    expect(wrapper.emitted('answer')).toEqual([[{ positive: false }]])
  })

  // The server drops the question at expiresAt and the run goes on without the answer.
  it('counts down to expiry and then stops answering', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1_000_000_000))
    const wrapper = mountTranscript({
      pendingQuestion: { ...QUESTION, expiresAt: 1_000_000 + 2 },
    })
    expect(wrapper.find('.ai-question-timer').text()).toBe('Expires in 0:02')

    await vi.advanceTimersByTimeAsync(3000)

    expect(wrapper.find('.ai-question-timer').text()).toBe('Expired')
    await wrapper.find('.ai-question-options button').trigger('click')
    expect(wrapper.emitted('answer')).toBeUndefined()
  })
})
