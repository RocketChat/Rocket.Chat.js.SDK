/**
 * @module ApiLivechat
 * Provides a client for making requests with Livechat Rocket.Chat's REST API
 */
import { ILivechatTokenAPI, ILivechatRoomCredentialAPI, ILivechatRoomSurveyAPI, INewLivechatGuestAPI, INewLivechatMessageAPI, ILivechatRoomMessagesAPI, INewLivechatNavigationAPI, INewLivechatCustomFieldAPI, INewLivechatOfflineMessageAPI, INewLivechatCustomFieldsAPI } from '../../interfaces';
import ApiBase from './api';
export default class ApiLivechat extends ApiBase {
    config(params: ILivechatTokenAPI): Promise<any>;
    room(credentials: ILivechatRoomCredentialAPI): Promise<any>;
    closeChat(credentials: ILivechatRoomCredentialAPI): Promise<any>;
    transferChat(credentials: ILivechatRoomCredentialAPI): Promise<any>;
    chatSurvey(survey: ILivechatRoomSurveyAPI): Promise<any>;
    visitor(params: ILivechatTokenAPI): Promise<any>;
    grantVisitor(guest: INewLivechatGuestAPI): Promise<any>;
    agent(credentials: ILivechatRoomCredentialAPI): Promise<any>;
    nextAgent(credentials: ILivechatRoomCredentialAPI): Promise<any>;
    sendMessage(message: INewLivechatMessageAPI): Promise<any>;
    editMessage(id: string, message: INewLivechatMessageAPI): Promise<any>;
    deleteMessage(id: string, credentials: ILivechatRoomCredentialAPI): Promise<any>;
    loadMessages(id: string, params: ILivechatRoomMessagesAPI): Promise<any>;
    sendOfflineMessage(message: INewLivechatOfflineMessageAPI): Promise<any>;
    sendVisitorNavigation(credentials: ILivechatRoomCredentialAPI, page: INewLivechatNavigationAPI): Promise<any>;
    requestTranscript(email: string, credentials: ILivechatRoomCredentialAPI): Promise<any>;
    videoCall(credentials: ILivechatRoomCredentialAPI): Promise<any>;
    sendCustomField(field: INewLivechatCustomFieldAPI): Promise<any>;
    sendCustomFields(fields: INewLivechatCustomFieldsAPI): Promise<any>;
}
