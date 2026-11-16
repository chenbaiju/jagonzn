import { afterEach, expect, it } from 'vitest'
import { EditorView } from '@codemirror/view'
import { indentMore, undo } from '@codemirror/commands'
import { createJsonEditor, type JsonEditorEngine } from '@/ui/json-code-editor-engine'

let editor: JsonEditorEngine | undefined
afterEach(() => { editor?.destroy(); editor = undefined; document.body.replaceChildren() })
function setup(value: string, change: (value: string) => void = () => {}) {
  const host = document.createElement('div'); document.body.append(host)
  editor = createJsonEditor(host, value, { ariaLabel: '命令参数 JSON', disabled: false, readonly: false }, change)
  return { host, view: EditorView.findFromDOM(host.querySelector('.cm-editor')!)! }
}
it('原始JSON、超出安全整数、HTML字样及混合空白不经解析或HTML执行', () => {
  const raw = '{\r\n  "n":9007199254740993,\n "html":"<img src=x onerror=alert(1)>"\r\n}'
  const changes: string[] = [], { host, view } = setup(raw, value => changes.push(value))
  expect(view.state.sliceDoc()).toBe(raw)
  expect(host.querySelector('img')).toBeNull()
  expect(changes).toEqual([])
  view.dispatch({ changes: { from: 0, to: 0, insert: ' ' } })
  expect(changes).toEqual([' ' + raw])
})
it('外部新对象更新不回发事件，也不能撤销回旧对象内容', () => {
  const changes: string[] = [], { view } = setup('{"old":1}', value => changes.push(value))
  view.dispatch({ changes: { from: 0, to: 0, insert: ' ' } })
  editor!.setValue('{"new":9007199254740993}')
  expect(view.state.sliceDoc()).toBe('{"new":9007199254740993}')
  expect(undo(view)).toBe(false)
  expect(changes).toEqual([' {"old":1}'])
})
it('动态只读、禁用、标签切换保留当前内容并拒绝编辑命令', () => {
  const { view } = setup('{"a":1}')
  editor!.configure({ ariaLabel: '回复参数 JSON', readonly: true, disabled: false })
  expect(view.contentDOM.getAttribute('aria-label')).toBe('回复参数 JSON')
  expect(view.contentDOM.getAttribute('aria-readonly')).toBe('true')
  expect(view.contentDOM.getAttribute('tabindex')).toBe('0')
  expect(indentMore(view)).toBe(false)
  editor!.configure({ ariaLabel: '回复参数 JSON', readonly: false, disabled: true })
  expect(view.contentDOM.getAttribute('aria-disabled')).toBe('true')
  expect(view.contentDOM.getAttribute('tabindex')).toBe('-1')
  editor!.setValue('{"b":2}')
  expect(view.state.readOnly).toBe(true)
  expect(view.contentDOM.getAttribute('aria-disabled')).toBe('true')
  editor!.configure({ ariaLabel: '命令参数 JSON', readonly: false, disabled: false })
  expect(indentMore(view)).toBe(true)
})
it('销毁可重复调用，后续外部写入不再回发或重建编辑DOM', () => {
  const changes: string[] = [], { host } = setup('false', value => changes.push(value))
  editor!.destroy(); editor!.destroy(); editor!.setValue('true'); editor!.configure({ ariaLabel: '已关闭', disabled: false, readonly: false })
  expect(host.querySelector('.cm-editor')).toBeNull()
  expect(changes).toEqual([])
})
