/** 按原站Babel与四空格配置整理明确草稿；不运行函数或读取外部配置。 */
export async function formatFunctionSource(source:string):Promise<string>{
 if(!source.trim())return ''
 const [prettier,babel,estree]=await Promise.all([import('prettier/standalone'),import('prettier/plugins/babel'),import('prettier/plugins/estree')])
 return prettier.format(source,{parser:'babel',plugins:[babel,estree],tabWidth:4})
}
