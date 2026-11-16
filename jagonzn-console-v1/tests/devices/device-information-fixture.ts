import currentInformation from './device-information-current-fixture.json'
/** 隔离信息页模拟数据；仅由显式测试预览入口使用，不写后端。 */
export const project='54504474-30a3-460a-bd24-f852489fd3e7'
export const device='01a1a506-da8d-73cd-a2fe-28bb962ae589'
export const typeId='01a162c9-b4a4-7408-b205-e9359d6c8901'
export const extensions={
  "deviceId": "01a1a506-da8d-73cd-a2fe-28bb962ae589",
  "deviceTypeId": "01a162c9-b4a4-7408-b205-e9359d6c8901",
  "definitionRevision": 1,
  "valueRevision": 1,
  "fields": [
    {
      "definition": {
        "id": "00000000-0000-4000-8000-000000000001",
        "name": "安装区域",
        "description": "设备资料展示样例，仅用于本机预览",
        "kind": "TEXT",
        "enabled": true,
        "options": [],
        "defaultValue": null,
        "onLabel": null,
        "offLabel": null
      },
      "value": "消防泵房 · 南侧入口",
      "effectiveValue": "消防泵房 · 南侧入口"
    },
    {
      "definition": {
        "id": "00000000-0000-4000-8000-000000000002",
        "name": "设备序列",
        "description": "设备资料展示样例，仅用于本机预览",
        "kind": "NUMBER",
        "enabled": true,
        "options": [],
        "defaultValue": null,
        "onLabel": null,
        "offLabel": null
      },
      "value": "9007199254740993.12345678901234567890",
      "effectiveValue": "9007199254740993.12345678901234567890"
    },
    {
      "definition": {
        "id": "00000000-0000-4000-8000-000000000003",
        "name": "维护电话",
        "description": "设备资料展示样例，仅用于本机预览",
        "kind": "PHONE",
        "enabled": true,
        "options": [],
        "defaultValue": null,
        "onLabel": null,
        "offLabel": null
      },
      "value": "+86 (755) 2867-3912 转 208",
      "effectiveValue": "+86 (755) 2867-3912 转 208"
    },
    {
      "definition": {
        "id": "00000000-0000-4000-8000-000000000004",
        "name": "产品资料",
        "description": "设备资料展示样例，仅用于本机预览",
        "kind": "URL",
        "enabled": true,
        "options": [],
        "defaultValue": null,
        "onLabel": null,
        "offLabel": null
      },
      "value": "https://www.thingscloud.xyz/docs/guide/device-type/extend-info-define.html",
      "effectiveValue": "https://www.thingscloud.xyz/docs/guide/device-type/extend-info-define.html"
    },
    {
      "definition": {
        "id": "00000000-0000-4000-8000-000000000005",
        "name": "启用巡检",
        "description": "设备资料展示样例，仅用于本机预览",
        "kind": "SWITCH",
        "enabled": true,
        "options": [],
        "defaultValue": null,
        "onLabel": "启用",
        "offLabel": "停用"
      },
      "value": "true",
      "effectiveValue": "true"
    },
    {
      "definition": {
        "id": "00000000-0000-4000-8000-000000000006",
        "name": "安装环境",
        "description": "设备资料展示样例，仅用于本机预览",
        "kind": "SELECT",
        "enabled": true,
        "options": [
          "室内",
          "室外"
        ],
        "defaultValue": null,
        "onLabel": null,
        "offLabel": null
      },
      "value": "室内",
      "effectiveValue": "室内"
    },
    {
      "definition": {
        "id": "00000000-0000-4000-8000-000000000007",
        "name": "检修日期",
        "description": "设备资料展示样例，仅用于本机预览",
        "kind": "DATE",
        "enabled": true,
        "options": [],
        "defaultValue": null,
        "onLabel": null,
        "offLabel": null
      },
      "value": "2026-10-28",
      "effectiveValue": "2026-10-28"
    },
    {
      "definition": {
        "id": "00000000-0000-4000-8000-000000000008",
        "name": "每日巡检",
        "description": "设备资料展示样例，仅用于本机预览",
        "kind": "TIME",
        "enabled": true,
        "options": [],
        "defaultValue": null,
        "onLabel": null,
        "offLabel": null
      },
      "value": "08:35",
      "effectiveValue": "08:35"
    }
  ]
} as const
export function informationFixture(state:string,path:string):unknown{
 if(state==='current'){const entry=Object.entries(currentInformation).find(([key])=>key===path||key.endsWith(path));if(entry)return entry[1]}
 const full=state==='full',stored=full||state==='retained',empty=state==='empty',unbound=state==='unbound',type=unbound?null:typeId
 if(path.endsWith('/reference-profile'))return{deviceId:device,name:'温湿度传感器 A01',deviceKey:'device-key-01',businessKey:'design_sensor_1_v2',description:null,deviceTypeId:type,referenceVersion:'0',profileToken:'a'.repeat(64)}
 if(path.endsWith('/location-details'))return{longitude:empty?null:113.942682,latitude:empty?null:22.539812,version:'0',address:full?'深圳示例测试点（非真实部署位置）':null,province:null,city:null,district:null,street:null,building:full?'A栋':null,unit:null,floor:full?'2':null,room:null,addressToken:'a'.repeat(64)}
 if(path.endsWith('/location-point'))return{longitude:empty?null:113.942682,latitude:empty?null:22.539812,version:'0'}
 if(path.endsWith('/location-observation'))return{source:'MANUAL',longitude:empty?null:113.942682,latitude:empty?null:22.539812,manualVersion:'0'}
 if(path.endsWith('/planar-position'))return{deviceId:device,currentDeviceTypeId:type,state:full?'MANUAL':'DISABLED',coordinateSystem:'TYPE_LOCAL_CARTESIAN',unit:'UNSPECIFIED',storedFrameDeviceTypeId:stored?typeId:null,storedX:stored?128.375:null,storedY:stored?76.625:null,positionVersion:'0',effectiveX:full?128.375:null,effectiveY:full?76.625:null}
 if(path.endsWith('/camera-reference'))return{deviceId:device,currentDeviceTypeId:type,provider:'EZVIZ',state:full?'ENABLED':'DISABLED',storedSerial:stored?'SIMULATED_CAMERA_0827':null,storedChannel:stored?1:null,referenceVersion:'0',effectiveSerial:full?'SIMULATED_CAMERA_0827':null,effectiveChannel:full?1:null}
 if(path.endsWith('/iccid-information'))return{deviceId:device,currentDeviceTypeId:type,storedManualIccid:stored?'00000000000000000001':null,informationVersion:'0',source:full?'MANUAL':'DISABLED',effectiveIccid:full?'00000000000000000001':null,verification:'UNVERIFIED'}
 if(path.endsWith('/extension-values'))return{...extensions,deviceTypeId:type,definitionRevision:unbound?0:extensions.definitionRevision,valueRevision:unbound?0:extensions.valueRevision,fields:full||state==='fields'?extensions.fields:[]}
 if(path.endsWith('/logical-presence'))return{deviceId:device,mode:'LEGACY_TRANSPORT',state:'INACTIVE',transportStatus:'INACTIVE',onlineTimeoutMinutes:null,observedAt:'2026-11-04T08:23:47Z',lastQualifiedCommunicationAt:null}
 if(path.endsWith('/alarms/device-status'))return{observedAt:'2026-11-04T08:23:47Z',devices:[{deviceId:device,modelVersionId:typeId,state:'NORMAL'}]}
 if(path.endsWith('/device-types/'+typeId))return{id:typeId,name:'环境监测传感器',deviceKind:'DIRECT',status:'PUBLISHED'}
 if(path.endsWith('/devices/'+device))return{id:device,deviceTypeId:type,name:'温湿度传感器 A01',status:'INACTIVE'}
 throw new Error('隔离预览未提供该读取')
}
