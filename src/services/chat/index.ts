import ChatServiceFactory from './ChatService';

export type ChatService = ReturnType<typeof ChatServiceFactory>;

export default ChatServiceFactory;