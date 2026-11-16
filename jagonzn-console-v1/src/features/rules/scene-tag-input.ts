import {sourceRuleTagInputValue,type SourceRuleTagDraft,type RuleTagDraft} from './rule-tag-draft'
/** Scene保留原签名和持久空值来源标记；只有纯Source输入规则共用。 */
export type SceneTagDraft=SourceRuleTagDraft
export function sceneTagInputValue(rows:readonly RuleTagDraft[],preserveExisting=false):Record<string,string>{return sourceRuleTagInputValue(rows,preserveExisting)}
