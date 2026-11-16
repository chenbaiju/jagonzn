import {ApiError} from '../../core/http'
import {createOrdinaryGroupAndVerify} from './ordinary-group-creation'
import {createSecretGroupAndVerify} from './secret-group-creation'
import {isOrdinaryCreationDraft} from './notification-group-contract'
import {isSecretGroupDraft} from './notification-secret-contract'
import type {NotificationGroupCreationContext,NotificationGroupDraft,NotificationGroupMemberChoice} from './notification-group-draft'
/** 八种明确方式共用完整表单，各自走正式管理用例与写后读取，不落旧generic POST。 */
export async function createNotificationGroupAndVerify(context:NotificationGroupCreationContext,draft:NotificationGroupDraft,members:NotificationGroupMemberChoice[]) {
 if(isOrdinaryCreationDraft(draft))return createOrdinaryGroupAndVerify(context,draft,members)
 if(isSecretGroupDraft(draft))return createSecretGroupAndVerify(context,draft)
 throw new ApiError('请选择通知方式',400)
}
