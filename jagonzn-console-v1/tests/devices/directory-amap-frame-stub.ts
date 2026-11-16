import {defineComponent,h,onMounted,onUnmounted,watch} from 'vue'
import {vi} from 'vitest'
export const frameFixture={fit:vi.fn(),zoom:vi.fn(),restart:vi.fn(),mounted:vi.fn(),unmounted:vi.fn()}
export default defineComponent({name:'DirectoryAmapFrame',props:['projectId','scopeKey','rows','selected','baseMap','disabled'],emits:['ready','loading','error','select','navigate'],setup(props,{emit,expose}){expose({fit:frameFixture.fit,zoom:frameFixture.zoom,restart:frameFixture.restart});onMounted(()=>{frameFixture.mounted();emit('ready',!props.disabled)});onUnmounted(()=>frameFixture.unmounted());watch(()=>props.disabled,value=>emit('ready',!value));return()=>h('div',{'data-map-frame-stub':''})}})
