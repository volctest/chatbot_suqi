export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: number;
  videoContext?: string;
  error?: boolean;
}

export interface ConversationContextType {
  messages: Message[];
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
}
