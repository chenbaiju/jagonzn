import {describe,expect,it} from 'vitest'
import {automationSceneRun,automationSceneRunAction,automationSceneSummary,automationSceneNode,automationActionStyle,automationScenePresentation} from '../../src/features/rules/automation-editor-draft'

const scene='0198c220-0000-7000-8000-000000000101'

describe('自动化执行场景配置',()=>{
 it('只接受 sceneId 与 waitForCompletion 的冻结形状',()=>{
  expect(automationSceneRun({nodeType:automationSceneNode,config:{sceneId:scene,waitForCompletion:false}})).toEqual({sceneId:scene,waitForCompletion:false})
  expect(automationSceneRun({nodeType:automationSceneNode,config:{sceneId:scene,waitForCompletion:false,deviceId:scene}})).toBeUndefined()
  expect(automationSceneRun({nodeType:automationSceneNode,config:{sceneId:'not-a-uuid',waitForCompletion:true}})).toBeUndefined()
  expect(automationSceneRun({nodeType:automationSceneNode,config:{sceneId:scene,waitForCompletion:'true'}})).toBeUndefined()
 })
 it('保存后回读保持原字段并显示等待状态',()=>{
  const node=automationSceneRunAction({sceneId:scene,waitForCompletion:true})
  expect(node).toEqual({nodeType:automationSceneNode,config:{sceneId:scene,waitForCompletion:true}})
  expect(automationSceneRun(node)).toEqual({sceneId:scene,waitForCompletion:true})
  expect(automationSceneSummary({sceneId:scene,waitForCompletion:true},'夜间巡检')).toBe('夜间巡检 · 等待场景完成')
  expect(automationSceneSummary({sceneId:scene,waitForCompletion:false})).toContain('不等待场景完成')
 })
 it('动作样式使用执行场景展示而不是下发属性',()=>{
  const node=automationSceneRunAction({sceneId:scene,waitForCompletion:false})
  expect(automationActionStyle(node)).toBe(automationScenePresentation)
  expect(automationScenePresentation.label).toBe('执行场景')
 })
})
