import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { can, projectId } from '../../core/session'
import { ApiError, assertIdentity, errorMessage, identityEpoch, IdentityChanged, onIdentityChange } from '../../core/http'
import { useResource } from '../../core/use-resource'
import { alarmApi } from './api'
import { groupBody, groupDescription, directoryTotal, idOf, recipientBody, type Channel, type Group, type Recipient } from './model'

/** 组详情直接读取；目录游标与组、收件人的并发版本彼此独立。 */
export function useAlarmWorkspace(groupId: () => string, counted = false, withRecipients = true) {
  const cursors = ref<(string | undefined)[]>([undefined]), page = ref(1), limit = ref(24)
  const directory = useResource(signal => counted ? alarmApi.groupDirectory(projectId.value, page.value, limit.value, signal) : alarmApi.groups(projectId.value, cursors.value[page.value - 1], signal))
  const detail = useResource(signal => alarmApi.group(projectId.value, groupId(), signal))
  const recipients = useResource(signal => alarmApi.recipients(projectId.value, groupId(), signal))
  const manage = computed(() => can('alarm:manage'))
  const nextCursor = computed(() => {
    const data = directory.data.value
    return data && 'nextCursor' in data && typeof data.nextCursor === 'string' ? data.nextCursor : undefined
  })
  const editingGroup = ref(false), editingRecipient = ref(false), busy = ref(false), error = ref(''), needsReview = ref(false)
  const selectedGroup = shallowRef<Group>(), selectedRecipient = shallowRef<Recipient>()
  const name = ref(''), description = ref(''), enabled = ref(false), target = ref(''), channel = ref<Channel>('EMAIL')
  let serial = 0
  function resetEditor() { serial++; editingGroup.value = false; editingRecipient.value = false; selectedGroup.value = undefined; selectedRecipient.value = undefined; name.value = ''; description.value = ''; target.value = ''; enabled.value = false; channel.value = 'EMAIL'; error.value = ''; busy.value = false; needsReview.value = false }
  function clear() { resetEditor(); cursors.value = [undefined]; page.value = 1; directory.clear(); detail.clear(); recipients.clear() }
  const dispose = onIdentityChange(clear)
  onScopeDispose(() => { serial++; dispose() })
  watch(manage, value => { if (!value) resetEditor() })
  async function reload() {
    if (!projectId.value || !can('alarm:read')) return
    if (groupId()) await Promise.all([detail.reload(), ...(withRecipients ? [recipients.reload()] : [])]); else await directory.reload()
  }
  watch([projectId, groupId, () => can('alarm:read')], () => { clear(); void reload() }, { immediate: true })
  async function move(next: boolean) {
    if (counted) return
    if (next) { const cursor = nextCursor.value; if (!cursor) return; cursors.value[page.value] = cursor; page.value++ }
    else if (page.value > 1) page.value--
    await directory.reload()
  }
  async function selectPage(value: number) {
    if (!counted || !Number.isSafeInteger(value) || value < 1 || directory.loading.value) return
    const total = directoryTotal(directory.data.value)
    if (total === undefined || BigInt(value) > ((BigInt(total) + BigInt(limit.value) - 1n) / BigInt(limit.value) || 1n)) return
    page.value = value; await directory.reload()
  }
  async function setLimit(value: number) {
    if (!counted || !Number.isSafeInteger(value) || value < 1 || value > 100) return
    limit.value = value; page.value = 1; cursors.value = [undefined]; directory.clear(); await directory.reload()
  }
  function openGroup(row?: Group) { if (!manage.value) return; resetEditor(); selectedGroup.value = row; name.value = row?.name || ''; description.value = row ? groupDescription(row) : ''; enabled.value = row ? row.enabled === true : true; editingGroup.value = true }
  function openRecipient(row?: Recipient) { if (!manage.value) return; resetEditor(); selectedRecipient.value = row; target.value = row?.target || ''; channel.value = row?.channel || 'EMAIL'; enabled.value = row?.enabled ?? false; editingRecipient.value = true }
  function changeChannel(value: Channel) { channel.value = value; target.value = '' }
  async function write(action: () => Promise<unknown>) {
    if (busy.value || needsReview.value || !manage.value) return
    const identity = identityEpoch(), request = ++serial
    busy.value = true; error.value = ''
    try {
      await action(); assertIdentity(identity)
      if (request !== serial) return
      resetEditor(); await reload()
    } catch (cause) {
      if (cause instanceof IdentityChanged || request !== serial) return
      if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) { resetEditor(); return }
      error.value = errorMessage(cause)
      if (cause instanceof ApiError && (cause.outcomeUnknown || cause.status === 409)) {
        needsReview.value = true
        error.value = cause.status === 409 ? '通知组已变更，请关闭后重新读取核对。' : '操作结果未知，请关闭后重新读取核对。'
      }
    } finally { if (request === serial) busy.value = false }
  }
  const saveGroup = () => write(() => alarmApi.saveGroup(projectId.value, groupBody(name.value, enabled.value, selectedGroup.value, description.value), selectedGroup.value))
  const toggleGroup = (row: Group, value: boolean) => write(() => alarmApi.saveGroup(projectId.value, groupBody(row.name || '', value, row), row))
  const saveRecipient = () => write(() => alarmApi.saveRecipient(projectId.value, groupId(), recipientBody(channel.value, target.value, enabled.value, selectedRecipient.value), selectedRecipient.value))
  return { directory, detail, recipients, manage, page, limit, selectPage, setLimit, editingGroup, editingRecipient, busy, error, needsReview, name, description, enabled, target, channel, selectedGroup, selectedRecipient, resetEditor, reload, move, openGroup, openRecipient, changeChannel, saveGroup, saveRecipient, toggleGroup, write, idOf }
}
