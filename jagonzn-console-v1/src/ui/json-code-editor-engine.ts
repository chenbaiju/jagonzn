import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, drawSelection, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { HighlightStyle, bracketMatching, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { json } from '@codemirror/lang-json'
import { tags } from '@lezer/highlight'

export interface JsonEditorOptions { ariaLabel: string; disabled: boolean; readonly: boolean }
export interface JsonEditorEngine {
  setValue(value: string): void
  configure(options: JsonEditorOptions): void
  measure(): void
  destroy(): void
}

/** 所有 JSON 输入共用一个编辑内核；文本不经 JSON.parse/stringify，数值和空白由调用方原样持有。 */
export function createJsonEditor(parent: HTMLElement, value: string, options: JsonEditorOptions,
  changed: (value: string) => void): JsonEditorEngine {
  const mode = new Compartment()
  let alive = true
  const attributes = (current: JsonEditorOptions) => [
    EditorState.readOnly.of(current.disabled || current.readonly),
    EditorView.editable.of(!current.disabled && !current.readonly),
    EditorView.contentAttributes.of({
      'aria-label': current.ariaLabel, 'aria-multiline': 'true', role: 'textbox',
      'aria-readonly': String(current.disabled || current.readonly),
      'aria-disabled': String(current.disabled), tabindex: current.disabled ? '-1' : '0',
      'aria-description': 'Tab 缩进；按 Escape 后再按 Tab 可离开编辑区。'
    })
  ]
  const extensions = () => [
    mode.of(attributes(options)), EditorState.lineSeparator.of('\n'), EditorState.tabSize.of(2),
    lineNumbers(), history(), drawSelection(), highlightActiveLine(), bracketMatching(),
    indentUnit.of('  '), json(), keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
    syntaxHighlighting(HighlightStyle.define([
      { tag: tags.propertyName, color: '#f8f8f2' }, { tag: tags.string, color: '#e6db74' },
      { tag: tags.number, color: '#ae81ff' }, { tag: [tags.bool, tags.null], color: '#ae81ff' },
      { tag: tags.punctuation, color: '#f8f8f2' }
    ])),
    EditorView.theme({
      '&': { height: '100%', color: '#f8f8f2', backgroundColor: '#272822', fontSize: '12px' },
      '&.cm-focused': { outline: 'none' },
      '.cm-scroller': { overflow: 'auto', fontFamily: 'Monaco, Menlo, Consolas, monospace', lineHeight: '1.5' },
      '.cm-content': { padding: '2px 0', caretColor: '#f8f8f0', minHeight: '100%' },
      '.cm-line': { padding: '0 4px' },
      '.cm-gutters': { backgroundColor: '#2f3129', color: '#8f908a', border: 'none' },
      '.cm-activeLineGutter': { backgroundColor: '#272822' },
      '.cm-activeLine': { backgroundColor: '#20211c' },
      '.cm-cursor': { borderLeftColor: '#f8f8f0' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: '#49483e' }
    }, { dark: true }),
    EditorView.updateListener.of(update => {
      if (alive && update.docChanged) changed(update.state.sliceDoc())
    })
  ]
  const view = new EditorView({ parent, state: EditorState.create({ doc: value, extensions: extensions() }) })
  return {
    setValue(next) {
      if (!alive || next === view.state.sliceDoc()) return
      // 外部切换对象/重新加载后清掉上一对象的撤销历史，不能撤销回另一设备的内容。
      view.setState(EditorState.create({ doc: next, extensions: extensions() }))
    },
    configure(next) {
      options = next
      if (alive) view.dispatch({ effects: mode.reconfigure(attributes(next)) })
    },
    measure() { if (alive) view.requestMeasure() },
    destroy() { if (alive) { alive = false; view.destroy() } }
  }
}
