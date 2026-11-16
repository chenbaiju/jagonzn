import { project, device, rule } from './device-alarm-history-fixture'
export function snapshot() {
  return { schemaVersion: 1, tenantId: project, projectId: project, deviceId: device, deviceTypeId: device,
    modelVersionId: device, ruleId: rule, ruleVersion: 1, ruleName: '当时规则名称', configuration: {},
    observedAt: '2026-10-24T00:00:00.123456Z', checkedAt: '2026-10-24T00:00:01.123456Z',
    checkKind: 'PROPERTY', truth: 'MATCH', outcome: 'READY', recoveryPermitted: false,
    matchingSamples: 1, firstMatchAt: null, receipt: {}, properties: {
      temperature: { dataType: 'NUMBER', known: true, value: 'PRECISE_NUMBER',
        acceptedAt: '2026-10-24T00:00:00.123456Z', origin: {}, timeBasis: 'ALARM_INTAKE' },
      enabled: { dataType: 'BOOLEAN', known: true, value: true,
        acceptedAt: '2026-10-24T00:00:00.123456Z', origin: {}, timeBasis: 'PLATFORM_ACCEPTED' },
      missing: { dataType: null, known: false, value: null, acceptedAt: null, origin: null, timeBasis: 'UNKNOWN' },
    } }
}
export const snapshotJson = () => JSON.stringify(snapshot()).replace('"PRECISE_NUMBER"','9007199254740993.1234567890123456789')
