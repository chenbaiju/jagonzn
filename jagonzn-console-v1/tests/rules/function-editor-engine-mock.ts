/** 测试专用编辑器引擎：用 textarea 替代 Ace，保留 aria-label/变更/配置契约。 */
export function createFunctionEditor(host: HTMLElement, value: string, options: {ariaLabel:string;disabled?:boolean;readonly?:boolean}, onChange: (value: string) => void) {
  const textarea = document.createElement('textarea')
  textarea.setAttribute('aria-label', options.ariaLabel)
  textarea.value = value
  textarea.disabled = !!options.disabled
  textarea.readOnly = !!options.readonly
  textarea.addEventListener('input', () => onChange(textarea.value))
  host.appendChild(textarea)
  return {
    setValue(next: string) { textarea.value = next },
    configure(next: {ariaLabel:string;disabled?:boolean;readonly?:boolean}) {
      textarea.setAttribute('aria-label', next.ariaLabel)
      textarea.disabled = !!next.disabled
      textarea.readOnly = !!next.readonly
    },
    measure() {},
    errors() { return [] as unknown[] },
    destroy() { textarea.remove() },
  }
}
