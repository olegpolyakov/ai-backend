export default class ChatService {
    sendMessage(conversationId: string, message: string): Promise<string> {
        return Promise.resolve('This is a placeholder response');
    }
}