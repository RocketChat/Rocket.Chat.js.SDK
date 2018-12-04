/**
 * @module ApiLivechat
 * Provides a client for making requests with Livechat Rocket.Chat's REST API
 */
import { ILivechatTokenAPI, ILivechatRoomCredentialAPI, ILivechatRoomSurveyAPI, INewLivechatGuestAPI, INewLivechatMessageAPI, ILivechatRoomMessagesAPI, INewLivechatNavigationAPI, INewLivechatCustomFieldAPI, INewLivechatOfflineMessageAPI, INewLivechatCustomFieldsAPI, ILivechatRoom } from '../../interfaces';
import ApiBase from './api';
export default class ApiLivechat extends ApiBase {
    credentials: ILivechatRoomCredentialAPI;
    login(guest: INewLivechatGuestAPI | any): Promise<any>;
    config(params?: ILivechatTokenAPI): Promise<any>;
    room(): Promise<any>;
    closeChat({ rid }: ILivechatRoom): Promise<any>;
    transferChat({ rid, department }: ILivechatRoom): Promise<any>;
    chatSurvey(survey: ILivechatRoomSurveyAPI): Promise<any>;
    visitor(params: ILivechatTokenAPI): Promise<any>;
    grantVisitor(guest: INewLivechatGuestAPI): Promise<any>;
    agent({ rid }: any): Promise<any>;
    nextAgent({ department }: any): Promise<any>;
    sendMessage(message: INewLivechatMessageAPI): Promise<any>;
    editMessage(id: string, message: INewLivechatMessageAPI): Promise<any>;
    deleteMessage(id: string, { rid }: ILivechatRoom): Promise<any>;
    loadMessages(rid: string, params?: ILivechatRoomMessagesAPI): Promise<any>;
    sendOfflineMessage(message: INewLivechatOfflineMessageAPI): Promise<any>;
    sendVisitorNavigation({ rid }: ILivechatRoom, page: INewLivechatNavigationAPI): Promise<any>;
    requestTranscript(email: string, { rid }: ILivechatRoom): Promise<any>;
    videoCall({ rid }: ILivechatRoom): Promise<any>;
    sendCustomField(field: INewLivechatCustomFieldAPI): Promise<any>;
    sendCustomFields(fields: INewLivechatCustomFieldsAPI): Promise<any>;
}
