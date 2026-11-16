import * as ace from 'ace-builds'
import 'ace-builds/src-noconflict/mode-javascript'
import 'ace-builds/src-noconflict/theme-monokai'
import workerUrl from 'ace-builds/src-noconflict/worker-javascript.js?url'

ace.config.set('loadWorkerFromBlob',false)
ace.config.setModuleUrl('ace/mode/javascript_worker',workerUrl)

export type FunctionEditorOptions={ariaLabel:string;disabled:boolean;readonly:boolean}
export function createFunctionEditor(host:HTMLElement,value:string,options:FunctionEditorOptions,changed:(value:string)=>void){
 const editor=ace.edit(host,{mode:'ace/mode/javascript',theme:'ace/theme/monokai',fontSize:16,textInputAriaLabel:options.ariaLabel,readOnly:options.disabled||options.readonly})
 let applying=false,live=true,current=options
 editor.setValue(value,-1)
 editor.session.on('change',()=>{if(live&&!applying&&!current.disabled&&!current.readonly)changed(editor.getValue())})
 return {
  setValue(value:string){if(!live||editor.getValue()===value)return;applying=true;try{editor.setValue(value,-1)}finally{applying=false}},
  configure(options:FunctionEditorOptions){current=options;editor.setOptions({readOnly:options.disabled||options.readonly,textInputAriaLabel:options.ariaLabel})},
  errors:()=>editor.session.getAnnotations().filter(value=>value.type==='error'),
  measure:()=>editor.resize(),
  destroy(){live=false;editor.session.setUseWorker(false);editor.destroy();host.replaceChildren()},
 }
}
export type FunctionEditorEngine=ReturnType<typeof createFunctionEditor>
